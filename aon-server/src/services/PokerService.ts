import { PokerTable, ActionType } from "../domain/poker/PokerTable";

/**
 * PokerService — application service for multiplayer poker.
 *
 * Owns the live tables and the player→table mapping, and exposes the use-cases
 * (create / join / leave / act / sit-out / rebuy / timeout / start). It is
 * FRAMEWORK-FREE: it knows nothing about Socket.IO, timers, or serialisation —
 * those are the realtime adapter's job (`realtime/poker/PokerGateway`). This is
 * the same layering the rest of the backend uses: business rules live in
 * services/domain, transport lives at the edge, and the two are wired in the
 * composition root (`container.ts`).
 */

const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const DEFAULT_STACK = 1000;
const MAX_SEATS = 6;

export interface JoinResult {
    ok: boolean;
    table?: PokerTable;
    seat?: number;
    error?: string;
}

export interface RequestJoinResult {
    ok: boolean;
    table?: PokerTable;
    hostName?: string;
    error?: string;
}

export interface AdmitResult {
    ok: boolean;
    table?: PokerTable;
    seat?: number;
    buyIn?: number;
    name?: string;
    error?: string;
}

export interface PeekResult {
    exists: boolean;
    hostName?: string;
    started?: boolean;
    seatsTaken?: number;
    maxSeats?: number;
}

export class PokerService {
    private tables = new Map<string, PokerTable>();
    private playerTable = new Map<string, string>();
    /**
     * seatToken → the player's FINAL chip stack, recorded by the realtime layer
     * the moment a seat is finally vacated (real leave / grace-period expiry).
     * This is the ONLY money-adjacent state the socket path writes, and it never
     * touches a wallet. The authenticated HTTP cash-out (GameService.pokerSettle)
     * reads AND consumes it, then credits exactly this value — so a client can
     * never name its own cash-out amount.
     */
    private finalStacks = new Map<string, number>();

    /* ------------------------------------------------- authoritative stacks */

    /** The player's live authoritative chip stack at their table (0 if unseated). */
    stackForPlayer(playerId: string): number {
        const table = this.tableForPlayer(playerId);
        return table ? table.stackOf(playerId) : 0;
    }

    /**
     * Record a seat's final stack so the HTTP cash-out can credit it. Does NOT
     * mutate any wallet — money only moves in the authenticated HTTP handlers.
     */
    recordFinalStack(seatToken: string, stack: number): void {
        if (!seatToken) return;
        this.finalStacks.set(seatToken, Math.max(0, Math.floor(stack)));
    }

    /**
     * Read AND consume the recorded final stack for a seatToken. Returns
     * `undefined` when the seat hasn't been finalized yet (the leave is still in
     * flight) so the caller can ask the client to retry rather than burn a stack.
     */
    takeFinalStack(seatToken: string): number | undefined {
        const v = this.finalStacks.get(seatToken);
        if (v !== undefined) this.finalStacks.delete(seatToken);
        return v;
    }

    /** Read the recorded final stack WITHOUT consuming it. */
    peekFinalStack(seatToken: string): number | undefined {
        return this.finalStacks.get(seatToken);
    }

    /* ----------------------------------------------------------- lookups */
    getTable(id: string): PokerTable | undefined {
        return this.tables.get(id);
    }
    getPlayerTableId(playerId: string): string | undefined {
        return this.playerTable.get(playerId);
    }
    tableForPlayer(playerId: string): PokerTable | undefined {
        const id = this.playerTable.get(playerId);
        return id ? this.tables.get(id) : undefined;
    }

    /* --------------------------------------------------------- table mgmt */
    createTable(): PokerTable {
        const id = this.newCode();
        const table = new PokerTable(id, SMALL_BLIND, BIG_BLIND, DEFAULT_STACK);
        this.tables.set(id, table);
        return table;
    }

    /** Find a table with an open seat, or create one (quick-play). */
    findOpenTable(): PokerTable {
        for (const t of this.tables.values()) if (t.occupied().length < MAX_SEATS) return t;
        return this.createTable();
    }

    join(playerId: string, name: string, tableId: string, buyIn?: number): JoinResult {
        const table = this.tables.get(tableId);
        if (!table) return { ok: false, error: "Table not found" };
        const seat = table.seatPlayer(playerId, name, buyIn);
        if (seat === -1) return { ok: false, error: "Table is full" };
        this.playerTable.set(playerId, tableId);
        return { ok: true, table, seat };
    }

    /* ----------------------------------------------------- host / lobby */

    /** Create a private room and seat its host. */
    createRoom(playerId: string, name: string, buyIn?: number): JoinResult {
        const table = this.createTable();
        table.setHost(playerId);
        const seat = table.seatPlayer(playerId, name, buyIn);
        this.playerTable.set(playerId, table.id);
        return { ok: true, table, seat };
    }

    /** Read a room's lobby info without joining (for the "Entering X's room" screen). */
    peek(tableId: string): PeekResult {
        const table = this.tables.get((tableId || "").toUpperCase());
        if (!table) return { exists: false };
        return {
            exists: true,
            hostName: table.hostName(),
            started: table.started,
            seatsTaken: table.occupied().length,
            maxSeats: MAX_SEATS,
        };
    }

    /** Request a seat — parks the player in the host's approval queue. */
    requestJoin(playerId: string, name: string, tableId: string, buyIn?: number): RequestJoinResult {
        const table = this.tables.get((tableId || "").toUpperCase());
        if (!table) return { ok: false, error: "Room not found" };
        if (table.occupied().length >= MAX_SEATS) return { ok: false, error: "Room is full" };
        if (table.isHost(playerId) || table.seats.some((s) => s?.id === playerId)) {
            this.playerTable.set(playerId, table.id);
            return { ok: true, table, hostName: table.hostName() };
        }
        table.addPending(playerId, name, buyIn);
        this.playerTable.set(playerId, table.id);
        return { ok: true, table, hostName: table.hostName() };
    }

    /** Host admits a queued player → seats them. */
    admit(hostId: string, targetId: string): AdmitResult {
        const table = this.tableForPlayer(hostId);
        if (!table) return { ok: false, error: "Table not found" };
        if (!table.isHost(hostId)) return { ok: false, error: "Only the host can admit players" };
        const res = table.admit(targetId);
        if (!res) return { ok: false, table, error: "Room is full" };
        this.playerTable.set(targetId, table.id);
        return { ok: true, table, seat: res.seat, buyIn: res.buyIn, name: res.name };
    }

    /** Host declines a queued player. */
    deny(hostId: string, targetId: string): { ok: boolean; table?: PokerTable; error?: string } {
        const table = this.tableForPlayer(hostId);
        if (!table) return { ok: false, error: "Table not found" };
        if (!table.isHost(hostId)) return { ok: false, error: "Only the host can decline players" };
        table.removePending(targetId);
        this.playerTable.delete(targetId);
        return { ok: true, table };
    }

    /** Host starts the game (first hand will deal). */
    startGame(hostId: string): { ok: boolean; table?: PokerTable; error?: string } {
        const table = this.tableForPlayer(hostId);
        if (!table) return { ok: false, error: "Table not found" };
        if (!table.isHost(hostId)) return { ok: false, error: "Only the host can start the game" };
        if (!table.startGame()) return { ok: false, table, error: "Need at least 2 players to start" };
        return { ok: true, table };
    }

    /** Re-attach a returning player to their held seat (reconnect). */
    reattach(playerId: string): PokerTable | undefined {
        const id = this.playerTable.get(playerId);
        if (!id) return undefined;
        const table = this.tables.get(id);
        if (!table) {
            this.playerTable.delete(playerId);
            return undefined;
        }
        table.setDisconnected(playerId, false);
        return table;
    }

    setDisconnected(playerId: string, value: boolean): PokerTable | undefined {
        const table = this.tableForPlayer(playerId);
        table?.setDisconnected(playerId, value);
        return table;
    }

    /** Remove a player; disposes the table if it's now empty. */
    removePlayer(playerId: string): { table?: PokerTable; deletedTableId?: string } {
        const id = this.playerTable.get(playerId);
        this.playerTable.delete(playerId);
        if (!id) return {};
        const table = this.tables.get(id);
        if (!table) return {};
        table.removePlayer(playerId);
        if (table.occupied().length === 0 && table.pending.length === 0) {
            this.tables.delete(id);
            return { deletedTableId: id };
        }
        return { table };
    }

    /* ----------------------------------------------------------- gameplay */
    act(playerId: string, action: ActionType, amount: number): { table?: PokerTable; error?: string } {
        const table = this.tableForPlayer(playerId);
        if (!table) return {};
        const error = table.act(playerId, action, amount);
        return { table, error: error ?? undefined };
    }
    sitOut(playerId: string): PokerTable | undefined {
        const t = this.tableForPlayer(playerId);
        t?.sitOut(playerId);
        return t;
    }
    sitIn(playerId: string): PokerTable | undefined {
        const t = this.tableForPlayer(playerId);
        t?.sitIn(playerId);
        return t;
    }
    rebuy(playerId: string): PokerTable | undefined {
        const t = this.tableForPlayer(playerId);
        t?.rebuy(playerId);
        return t;
    }
    timeout(tableId: string): PokerTable | undefined {
        const t = this.tables.get(tableId);
        t?.timeoutCurrent();
        return t;
    }
    maybeStartHand(tableId: string): boolean {
        return this.tables.get(tableId)?.maybeStartHand() ?? false;
    }

    /* -------------------------------------------------------------- utils */
    private newCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        do {
            code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        } while (this.tables.has(code));
        return code;
    }
}
