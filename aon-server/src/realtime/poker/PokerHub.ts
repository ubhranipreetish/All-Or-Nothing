import { Server, Namespace, Socket } from "socket.io";
import { PokerTable, ActionType } from "../../domain/poker/PokerTable";

/**
 * PokerHub — the realtime edge for multiplayer poker. Owns the live tables,
 * exposes the `/poker` namespace, serialises a per-viewer sanitised snapshot,
 * runs the turn clock (with timeout penalties) and the inter-hand pause, and
 * supports stable identity + reconnect-to-seat so a refresh keeps your seat.
 *
 * Fully self-contained — it touches none of the existing HTTP services.
 */

const TURN_SECONDS = 20; // base time to act before auto check/fold
const NEXT_HAND_DELAY = 5000; // showdown reveal pause before the next hand
const RECONNECT_GRACE = 60000; // keep a disconnected player's seat this long

class PokerHub {
    private nsp: Namespace | null = null;
    private tables = new Map<string, PokerTable>();
    private playerTable = new Map<string, string>(); // playerId -> tableId (for reconnect)
    private turnTimers = new Map<string, NodeJS.Timeout>();
    private handTimers = new Map<string, NodeJS.Timeout>();
    private removeTimers = new Map<string, NodeJS.Timeout>();

    register(io: Server): void {
        this.nsp = io.of("/poker");
        this.nsp.on("connection", (socket: Socket) => this.onConnection(socket));
        console.log("Poker hub registered on /poker");
    }

    private onConnection(socket: Socket): void {
        const pid = (socket.handshake.auth?.playerId as string) || socket.id;
        socket.data.playerId = pid;
        socket.data.name = (socket.handshake.auth?.name as string)?.slice(0, 18) || "Guest";

        // Reconnect: if this player still holds a seat, re-attach to it.
        const prevTableId = this.playerTable.get(pid);
        if (prevTableId && this.tables.has(prevTableId)) {
            const table = this.tables.get(prevTableId)!;
            const t = this.removeTimers.get(pid);
            if (t) { clearTimeout(t); this.removeTimers.delete(pid); }
            table.setDisconnected(pid, false);
            socket.data.tableId = prevTableId;
            socket.join(this.room(prevTableId));
            socket.emit("poker:reconnected", { tableId: prevTableId });
            this.afterChange(table);
        }

        socket.on("table:quickJoin", (cb?: (r: unknown) => void) => {
            this.joinTable(socket, this.findOpenTable().id, cb);
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
        socket.on("sitOut", () => this.mutate(socket, (t, id) => t.sitOut(id)));
        socket.on("sitIn", () => this.mutate(socket, (t, id) => t.sitIn(id)));
        socket.on("rebuy", () => this.mutate(socket, (t, id) => t.rebuy(id)));
        socket.on("table:leave", () => this.leave(socket, true));
        socket.on("disconnect", () => this.onDisconnect(socket));
    }

    private mutate(socket: Socket, fn: (t: PokerTable, id: string) => void): void {
        const table = this.tableOf(socket);
        if (!table) return;
        fn(table, socket.data.playerId);
        this.afterChange(table);
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
        this.playerTable.set(socket.data.playerId, tableId);
        socket.join(this.room(tableId));
        cb?.({ tableId, seat });
        this.afterChange(table);
    }

    private leave(socket: Socket, intentional: boolean): void {
        const table = this.tableOf(socket);
        if (!table) return;
        table.removePlayer(socket.data.playerId);
        if (intentional) this.playerTable.delete(socket.data.playerId);
        socket.leave(this.room(table.id));
        socket.data.tableId = undefined;
        if (table.occupied().length === 0) {
            this.clearTimers(table.id);
            this.tables.delete(table.id);
            return;
        }
        this.afterChange(table);
    }

    private onDisconnect(socket: Socket): void {
        const table = this.tableOf(socket);
        const pid = socket.data.playerId as string;
        if (!table) return;
        table.setDisconnected(pid, true);
        // Hold the seat for a grace period so a refresh can reclaim it; the turn
        // clock will auto-fold them if it's their turn meanwhile.
        const timer = setTimeout(() => {
            this.removeTimers.delete(pid);
            const t = this.tables.get(table.id);
            if (!t) return;
            t.removePlayer(pid);
            this.playerTable.delete(pid);
            if (t.occupied().length === 0) { this.clearTimers(t.id); this.tables.delete(t.id); return; }
            this.afterChange(t);
        }, RECONNECT_GRACE);
        this.removeTimers.set(pid, timer);
        this.afterChange(table);
    }

    private tableOf(socket: Socket): PokerTable | undefined {
        return socket.data.tableId ? this.tables.get(socket.data.tableId) : undefined;
    }

    /* ----------------------------------------------- state change pipeline */

    private afterChange(table: PokerTable): void {
        if (!table.handActive && !this.handTimers.has(table.id)) table.maybeStartHand();
        this.armTurnTimer(table);
        this.broadcast(table);
        this.scheduleNextHand(table);
    }

    private scheduleNextHand(table: PokerTable): void {
        if (table.handActive || this.handTimers.has(table.id)) return;
        if (table.occupied().length < 2) return;
        const timer = setTimeout(() => {
            this.handTimers.delete(table.id);
            if (table.maybeStartHand()) {
                this.armTurnTimer(table);
                this.broadcast(table);
            }
        }, NEXT_HAND_DELAY);
        this.handTimers.set(table.id, timer);
    }

    private armTurnTimer(table: PokerTable): void {
        this.clearTurnTimer(table.id);
        const actorId = table.currentActorId();
        if (!actorId) { table.deadlineTs = null; return; }
        table.deadlineTs = Date.now() + TURN_SECONDS * 1000;
        const timer = setTimeout(() => {
            if (table.currentActorId() !== actorId) return;
            table.timeoutCurrent();
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
        const winnerSeats = new Set((table.winners || []).map((w) => w.seat));
        const me = table.seats.find((s) => s?.id === viewerId);
        return {
            tableId: table.id,
            phase: table.phase,
            community: table.community,
            pot: table.potTotal(),
            currentBet: table.currentBet,
            bigBlind: table.bigBlind,
            smallBlind: table.smallBlind,
            startingStack: table.startingStack,
            dealer: table.dealer,
            toAct: table.toAct,
            handId: table.handId,
            handActive: table.handActive,
            winners: table.winners,
            deadlineTs: table.deadlineTs,
            serverNow: Date.now(),
            turnSeconds: TURN_SECONDS,
            youId: viewerId,
            youSeated: !!me,
            youAway: !!me?.away,
            youCanRebuy: !!me && !me.inHand && me.stack < table.startingStack,
            seats: table.seats.map((s, i) =>
                s
                    ? {
                          seat: i,
                          name: s.name,
                          stack: s.stack,
                          bet: s.bet,
                          folded: s.folded,
                          allIn: s.allIn,
                          away: s.away,
                          disconnected: s.disconnected,
                          lastAction: s.lastAction,
                          isTurn: table.toAct === i,
                          isYou: s.id === viewerId,
                          isDealer: table.dealer === i && table.handActive,
                          blind: table.handActive ? (table.sbSeat === i ? "SB" : table.bbSeat === i ? "BB" : null) : null,
                          isWinner: winnerSeats.has(i),
                          hasCards: s.cards.length > 0,
                          cards: s.id === viewerId || (reveal && !s.folded && s.inHand) ? s.cards : null,
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
