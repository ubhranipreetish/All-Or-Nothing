import { Server, Namespace, Socket } from "socket.io";
import { PokerTable, ActionType } from "../../domain/poker/PokerTable";

/**
 * PokerHub — the realtime edge for multiplayer poker.
 *
 * Owns the live tables (in memory), exposes the `/poker` Socket.IO namespace,
 * and is the ONLY thing that talks to sockets. It serialises a per-viewer,
 * sanitised snapshot of each table (hole cards hidden until showdown), runs the
 * turn clock (auto check/fold on timeout) and auto-starts the next hand.
 *
 * It is fully self-contained: it touches none of the existing HTTP services, so
 * the platform's REST/socket behaviour is unchanged.
 */

const TURN_SECONDS = 25;
const NEXT_HAND_DELAY = 4500;

class PokerHub {
    private nsp: Namespace | null = null;
    private tables = new Map<string, PokerTable>();
    private turnTimers = new Map<string, NodeJS.Timeout>();
    private handTimers = new Map<string, NodeJS.Timeout>();

    register(io: Server): void {
        this.nsp = io.of("/poker");
        this.nsp.on("connection", (socket: Socket) => this.onConnection(socket));
        console.log("Poker hub registered on /poker");
    }

    private onConnection(socket: Socket): void {
        socket.data.playerId = socket.id;
        socket.data.name = (socket.handshake.auth?.name as string)?.slice(0, 18) || "Guest";

        socket.on("table:quickJoin", (cb?: (r: unknown) => void) => {
            const table = this.findOpenTable();
            this.joinTable(socket, table.id, cb);
        });

        socket.on("table:join", (data: { tableId?: string }, cb?: (r: unknown) => void) => {
            const id = (data?.tableId || "").toUpperCase();
            if (!this.tables.has(id)) return cb?.({ error: "Table not found" });
            this.joinTable(socket, id, cb);
        });

        socket.on("action", (data: { type: ActionType; amount?: number }) => {
            const table = this.tableOf(socket);
            if (!table) return;
            const err = table.act(socket.data.playerId, data?.type, data?.amount || 0);
            if (err) return void socket.emit("poker:error", { message: err });
            this.afterChange(table);
        });

        socket.on("table:leave", () => this.leave(socket));
        socket.on("disconnect", () => this.leave(socket));
    }

    /* -------------------------------------------------------------- tables */

    private findOpenTable(): PokerTable {
        for (const t of this.tables.values()) if (t.occupied().length < 6) return t;
        const id = this.newCode();
        const table = new PokerTable(id);
        this.tables.set(id, table);
        return table;
    }

    private joinTable(socket: Socket, tableId: string, cb?: (r: unknown) => void): void {
        const table = this.tables.get(tableId);
        if (!table) return cb?.({ error: "Table not found" });
        const seat = table.seatPlayer(socket.data.playerId, socket.data.name);
        if (seat === -1) return cb?.({ error: "Table is full" });
        socket.data.tableId = tableId;
        socket.join(this.room(tableId));
        cb?.({ tableId, seat });
        this.afterChange(table);
    }

    private leave(socket: Socket): void {
        const table = this.tableOf(socket);
        if (!table) return;
        table.removePlayer(socket.data.playerId);
        socket.leave(this.room(table.id));
        socket.data.tableId = undefined;
        if (table.occupied().length === 0) {
            this.clearTimers(table.id);
            this.tables.delete(table.id);
            return;
        }
        this.afterChange(table);
    }

    private tableOf(socket: Socket): PokerTable | undefined {
        return socket.data.tableId ? this.tables.get(socket.data.tableId) : undefined;
    }

    /* ----------------------------------------------- state change pipeline */

    private afterChange(table: PokerTable): void {
        // Start a hand if we're idle and now have enough players.
        if (!table.handActive && !this.handTimers.has(table.id)) {
            if (table.maybeStartHand()) { /* started immediately */ }
        }
        this.broadcast(table);
        this.armTurnTimer(table);
        this.scheduleNextHand(table);
    }

    private scheduleNextHand(table: PokerTable): void {
        if (table.handActive || this.handTimers.has(table.id)) return;
        if (table.occupied().length < 2) return;
        const timer = setTimeout(() => {
            this.handTimers.delete(table.id);
            if (table.maybeStartHand()) {
                this.broadcast(table);
                this.armTurnTimer(table);
            }
        }, NEXT_HAND_DELAY);
        this.handTimers.set(table.id, timer);
    }

    private armTurnTimer(table: PokerTable): void {
        this.clearTurnTimer(table.id);
        const actorId = table.currentActorId();
        if (!actorId) return;
        const timer = setTimeout(() => {
            // auto-act: check if possible, otherwise fold
            const seat = table.seats[table.toAct];
            if (!seat || seat.id !== actorId) return;
            const canCheck = table.currentBet - seat.bet <= 0;
            table.act(actorId, canCheck ? "check" : "fold");
            this.afterChange(table);
        }, TURN_SECONDS * 1000);
        this.turnTimers.set(table.id, timer);
    }

    /* ----------------------------------------------------- serialisation */

    private async broadcast(table: PokerTable): Promise<void> {
        if (!this.nsp) return;
        const sockets = await this.nsp.in(this.room(table.id)).fetchSockets();
        for (const s of sockets) s.emit("poker:state", this.viewFor(table, s.data.playerId));
    }

    private viewFor(table: PokerTable, viewerId: string) {
        const reveal = table.phase === "showdown";
        return {
            tableId: table.id,
            phase: table.phase,
            community: table.community,
            pot: table.potTotal(),
            currentBet: table.currentBet,
            bigBlind: table.bigBlind,
            smallBlind: table.smallBlind,
            dealer: table.dealer,
            toAct: table.toAct,
            handId: table.handId,
            handActive: table.handActive,
            winners: table.winners,
            turnSeconds: TURN_SECONDS,
            youId: viewerId,
            seats: table.seats.map((s, i) =>
                s
                    ? {
                          seat: i,
                          name: s.name,
                          stack: s.stack,
                          bet: s.bet,
                          folded: s.folded,
                          allIn: s.allIn,
                          sittingOut: s.sittingOut,
                          connected: s.connected,
                          lastAction: s.lastAction,
                          isTurn: table.toAct === i,
                          isYou: s.id === viewerId,
                          hasCards: s.cards.length > 0,
                          cards: s.id === viewerId || (reveal && !s.folded) ? s.cards : null,
                      }
                    : null,
            ),
            legal: this.legalFor(table, viewerId),
        };
    }

    private legalFor(table: PokerTable, viewerId: string) {
        if (table.toAct < 0 || table.seats[table.toAct]?.id !== viewerId) return null;
        const s = table.seats[table.toAct]!;
        const toCall = table.currentBet - s.bet;
        const callAmount = Math.min(toCall, s.stack);
        const minRaiseTo = table.currentBet === 0 ? table.bigBlind : table.currentBet + table.minRaise;
        const maxRaiseTo = s.bet + s.stack;
        return {
            toCall,
            canCheck: toCall <= 0,
            canCall: toCall > 0 && s.stack > 0,
            callAmount,
            canRaise: s.stack > callAmount && maxRaiseTo > table.currentBet,
            minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
            maxRaiseTo,
            isBet: table.currentBet === 0,
        };
    }

    /* -------------------------------------------------------------- utils */

    private room(id: string): string {
        return `poker:${id}`;
    }

    private newCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        do {
            code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        } while (this.tables.has(code));
        return code;
    }

    private clearTurnTimer(id: string): void {
        const t = this.turnTimers.get(id);
        if (t) clearTimeout(t);
        this.turnTimers.delete(id);
    }

    private clearTimers(id: string): void {
        this.clearTurnTimer(id);
        const h = this.handTimers.get(id);
        if (h) clearTimeout(h);
        this.handTimers.delete(id);
    }
}

export const pokerHub = new PokerHub();
