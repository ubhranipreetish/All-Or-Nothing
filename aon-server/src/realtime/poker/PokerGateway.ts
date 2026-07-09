import { Server, Namespace, Socket } from "socket.io";
import { PokerService } from "../../services/PokerService";
import { PokerTable, ActionType } from "../../domain/poker/PokerTable";

/**
 * PokerGateway — the realtime transport adapter for poker (infrastructure edge).
 *
 * It is deliberately THIN: it owns the Socket.IO `/poker` namespace, the turn
 * clock / inter-hand / reconnect-grace timers, and the per-viewer serialisation
 * (a presenter that hides hole cards until showdown) — but every table mutation
 * is delegated to the injected `PokerService`. No game rules live here. The
 * service is supplied by the composition root (`container.ts`), so this class
 * depends on an abstraction it receives, not a global singleton.
 */

const TURN_SECONDS = 20;
const NEXT_HAND_DELAY = 5000;
const RECONNECT_GRACE = 60000;

export class PokerGateway {
    private nsp: Namespace | null = null;
    private turnTimers = new Map<string, NodeJS.Timeout>();
    private handTimers = new Map<string, NodeJS.Timeout>();
    private removeTimers = new Map<string, NodeJS.Timeout>();
    /**
     * playerId → seatToken, learned from the client's table:create / table:join
     * payload. The token is minted by the authenticated HTTP buy-in; the socket
     * only carries it so we can tie this seat to its GameSession when finalizing
     * the stack. It is never used to move money here.
     */
    private seatTokens = new Map<string, string>();

    constructor(private readonly poker: PokerService) {}

    register(io: Server): void {
        this.nsp = io.of("/poker");
        this.nsp.on("connection", (socket: Socket) => this.onConnection(socket));
        console.log("Poker gateway registered on /poker");
    }

    private onConnection(socket: Socket): void {
        const pid = (socket.handshake.auth?.playerId as string) || socket.id;
        socket.data.playerId = pid;
        socket.data.name = (socket.handshake.auth?.name as string)?.slice(0, 18) || "Guest";

        // Reconnect: re-attach to a held seat if the player still has one.
        const reattached = this.poker.reattach(pid);
        if (reattached) {
            const t = this.removeTimers.get(pid);
            if (t) { clearTimeout(t); this.removeTimers.delete(pid); }
            socket.data.tableId = reattached.id;
            socket.join(this.room(reattached.id));
            socket.emit("poker:reconnected", { tableId: reattached.id });
            this.afterChange(reattached);
        }

        // Quick-play (legacy / no host gate): seat immediately and auto-start.
        socket.on("table:quickJoin", (data: { buyIn?: number } | ((r: unknown) => void), cb?: (r: unknown) => void) => {
            const { buyIn, callback } = this.normalizeJoinArgs(data, cb);
            const table = this.poker.findOpenTable();
            if (!table.hostId) table.setHost(socket.data.playerId);
            table.started = true;
            this.doJoin(socket, table.id, buyIn, callback);
        });

        // Read a room's lobby info for the "Entering X's room" screen (no join).
        socket.on("table:peek", (data: { tableId?: string }, cb?: (r: unknown) => void) => {
            cb?.(this.poker.peek(data?.tableId || ""));
        });

        // Host creates a private room and is seated immediately. The buy-in was
        // already debited by the authenticated HTTP endpoint; the seatToken it
        // issued rides along so we can finalize this seat's stack later.
        socket.on("table:create", (data: { buyIn?: number; seatToken?: string }, cb?: (r: unknown) => void) => {
            const res = this.poker.createRoom(socket.data.playerId, socket.data.name, data?.buyIn);
            if (data?.seatToken) this.seatTokens.set(socket.data.playerId, data.seatToken);
            socket.data.tableId = res.table!.id;
            socket.join(this.room(res.table!.id));
            cb?.({ tableId: res.table!.id, seat: res.seat });
            this.afterChange(res.table!);
        });

        // Player requests a seat → parked in the host's approval queue. Their
        // buy-in was already debited over HTTP; carry the seatToken so cash-out
        // (or a decline → HTTP refund) can be reconciled to this session.
        socket.on("table:join", (data: { tableId?: string; buyIn?: number; seatToken?: string }, cb?: (r: unknown) => void) => {
            const res = this.poker.requestJoin(socket.data.playerId, socket.data.name, data?.tableId || "", data?.buyIn);
            if (!res.ok) return void cb?.({ error: res.error });
            if (data?.seatToken) this.seatTokens.set(socket.data.playerId, data.seatToken);
            socket.data.tableId = res.table!.id;
            socket.join(this.room(res.table!.id));
            cb?.({ tableId: res.table!.id, hostName: res.hostName });
            this.afterChange(res.table!); // updates the host's pending list
        });

        // Host admits a queued player.
        socket.on("table:admit", (data: { targetId?: string }) => {
            const res = this.poker.admit(socket.data.playerId, data?.targetId || "");
            if (!res.ok) return void socket.emit("poker:error", { message: res.error || "Could not admit" });
            this.emitTo(res.table!.id, data!.targetId!, "poker:admitted", { buyIn: res.buyIn });
            this.afterChange(res.table!);
        });

        // Host declines a queued player.
        socket.on("table:deny", (data: { targetId?: string }) => {
            const res = this.poker.deny(socket.data.playerId, data?.targetId || "");
            if (!res.ok) return void socket.emit("poker:error", { message: res.error || "Could not decline" });
            this.kickPending(res.table!.id, data!.targetId!);
            this.afterChange(res.table!);
        });

        // Host starts the game (deals the first hand).
        socket.on("table:start", () => {
            const res = this.poker.startGame(socket.data.playerId);
            if (!res.ok) return void socket.emit("poker:error", { message: res.error || "Could not start" });
            this.afterChange(res.table!);
        });

        // A queued player gives up waiting.
        socket.on("table:cancelWait", () => this.leave(socket));

        socket.on("action", (data: { type: ActionType; amount?: number }) => {
            const { table, error } = this.poker.act(socket.data.playerId, data?.type, data?.amount || 0);
            if (error) return void socket.emit("poker:error", { message: error });
            if (table) this.afterChange(table);
        });
        socket.on("sitOut", () => this.applyAndBroadcast(this.poker.sitOut(socket.data.playerId)));
        socket.on("sitIn", () => this.applyAndBroadcast(this.poker.sitIn(socket.data.playerId)));
        socket.on("rebuy", () => this.applyAndBroadcast(this.poker.rebuy(socket.data.playerId)));
        socket.on("table:leave", () => this.leave(socket));
        socket.on("disconnect", () => this.onDisconnect(socket));
    }

    private doJoin(socket: Socket, tableId: string, buyIn: number | undefined, cb?: (r: unknown) => void): void {
        const res = this.poker.join(socket.data.playerId, socket.data.name, tableId, buyIn);
        if (!res.ok) return cb?.({ error: res.error });
        socket.data.tableId = res.table!.id;
        socket.join(this.room(res.table!.id));
        cb?.({ tableId: res.table!.id, seat: res.seat });
        this.afterChange(res.table!);
    }

    private applyAndBroadcast(table: PokerTable | undefined): void {
        if (table) this.afterChange(table);
    }

    /**
     * MONEY TOUCHPOINT (socket side, read-only w.r.t. wallets). The realtime
     * layer's ONLY money-adjacent job: snapshot the seat's authoritative final
     * stack under its seatToken so the authenticated HTTP cash-out can credit
     * exactly that amount. No wallet is mutated here. Must run BEFORE the seat is
     * cleared (removePlayer nulls the stack), and ONLY on a FINAL exit (real
     * leave / grace-period expiry) — never a transient reconnect. One-shot: the
     * seatToken is dropped after recording so a stack can't be finalized twice.
     */
    private finalizeStack(playerId: string): void {
        const seatToken = this.seatTokens.get(playerId);
        if (!seatToken) return;
        const stack = this.poker.stackForPlayer(playerId);
        this.poker.recordFinalStack(seatToken, stack);
        this.seatTokens.delete(playerId);
    }

    private leave(socket: Socket): void {
        this.finalizeStack(socket.data.playerId); // record BEFORE the seat is cleared
        const { table } = this.poker.removePlayer(socket.data.playerId);
        const prev = socket.data.tableId as string | undefined;
        if (prev) socket.leave(this.room(prev));
        socket.data.tableId = undefined;
        if (table) this.afterChange(table);
        else if (prev) this.clearTimers(prev);
    }

    private onDisconnect(socket: Socket): void {
        const pid = socket.data.playerId as string;
        const table = this.poker.setDisconnected(pid, true);
        if (!table) return;
        // Hold the seat for a grace period; the turn clock still auto-folds them.
        const timer = setTimeout(() => {
            this.removeTimers.delete(pid);
            this.finalizeStack(pid); // grace expired → FINAL exit; record the stack
            const { table: t, deletedTableId } = this.poker.removePlayer(pid);
            if (deletedTableId) { this.clearTimers(deletedTableId); return; }
            if (t) this.afterChange(t);
        }, RECONNECT_GRACE);
        this.removeTimers.set(pid, timer);
        this.afterChange(table);
    }

    /* ----------------------------------------------- state change pipeline */
    private afterChange(table: PokerTable): void {
        if (table.started && !table.handActive && !this.handTimers.has(table.id)) this.poker.maybeStartHand(table.id);
        this.armTurnTimer(table);
        this.broadcast(table);
        this.scheduleNextHand(table);
    }

    private scheduleNextHand(table: PokerTable): void {
        if (!table.started || table.handActive || this.handTimers.has(table.id)) return;
        if (table.occupied().length < 2) return;
        const timer = setTimeout(() => {
            this.handTimers.delete(table.id);
            if (this.poker.maybeStartHand(table.id)) {
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
            this.poker.timeout(table.id);
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

    /** Emit a one-off event to a specific player's socket within a room. */
    private async emitTo(tableId: string, playerId: string, event: string, payload: unknown): Promise<void> {
        if (!this.nsp) return;
        const sockets = await this.nsp.in(this.room(tableId)).fetchSockets();
        for (const s of sockets) if (s.data.playerId === playerId) s.emit(event, payload);
    }

    /** Tell a declined player they were declined and remove them from the room. */
    private async kickPending(tableId: string, playerId: string): Promise<void> {
        if (!this.nsp) return;
        const sockets = await this.nsp.in(this.room(tableId)).fetchSockets();
        for (const s of sockets) {
            if (s.data.playerId !== playerId) continue;
            s.emit("poker:denied", {});
            s.leave(this.room(tableId));
            s.data.tableId = undefined;
        }
    }

    private viewFor(table: PokerTable, viewerId: string) {
        const me = table.seats.find((s) => s?.id === viewerId);

        // Un-admitted players in the approval queue see only a "waiting" stub —
        // never seats or cards.
        if (!me && table.hasPending(viewerId)) {
            return {
                tableId: table.id,
                phase: "waiting",
                youPending: true,
                started: table.started,
                hostName: table.hostName(),
                youId: viewerId,
                youSeated: false,
                seats: [],
                community: [],
                pot: 0,
                legal: null,
            };
        }

        const winnerSeats = new Set((table.winners || []).map((w) => w.seat));
        // A freshly-admitted late joiner (seated, not away, not yet in the hand)
        // spectates the current hand with every hole card revealed. A player who
        // simply sat out (away) is NOT shown others' cards.
        const iSpectate = table.handActive && !!me && !me.inHand && !me.away;
        const reveal = table.phase === "showdown";
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
            // lobby / host context
            started: table.started,
            youHost: table.isHost(viewerId),
            youPending: false,
            youSpectating: iSpectate,
            hostName: table.hostName(),
            pending: table.pending.map((p) => ({ id: p.id, name: p.name, buyIn: p.buyIn })),
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
                          // own cards always; spectators (late joiners) see every
                          // hole card; everyone sees live hands at showdown.
                          cards:
                              s.id === viewerId || iSpectate || (reveal && !s.folded && s.inHand)
                                  ? s.cards
                                  : null,
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
    private normalizeJoinArgs(
        data: { buyIn?: number } | ((r: unknown) => void) | undefined,
        cb?: (r: unknown) => void,
    ): { buyIn: number | undefined; callback?: (r: unknown) => void } {
        if (typeof data === "function") return { buyIn: undefined, callback: data };
        return { buyIn: data?.buyIn, callback: cb };
    }
    private room(id: string): string {
        return `poker:${id}`;
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
