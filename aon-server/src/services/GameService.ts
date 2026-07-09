import crypto from "crypto";
import { GameStrategyFactory } from "../domain/games/GameStrategyFactory";
import { GameType } from "../domain/games/GameStrategy";
import {
    generateMines,
    minesMultiplier,
    generateDragons,
    dragonMultiplier,
    DRAGON_TILES,
    DRAGON_ROWS,
    MINES_TILE_COUNT,
    MINES_MIN,
    MINES_MAX,
    spinWheelOutcome,
    spinRouletteOutcome,
    resolveRouletteBet,
    RouletteBetInput,
    ResolvedRouletteBet,
} from "../domain/games/GameOutcome";
import { GameSessionRepository, GameSessionDoc } from "../repositories/GameSessionRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository, WalletTotals } from "../repositories/UserRepository";
import type { PokerService } from "./PokerService";
import { eventBus } from "../shared/events/EventBus";
import { DomainEvent } from "../shared/events/DomainEvents";
import { AppError } from "../shared/errors/AppError";
import {
    CompositeValidator,
    PositiveNumberValidator,
    RequiredValidator,
} from "../shared/validation/Validator";

/**
 * GameService — the money-authoritative core.
 *
 * SECURITY MODEL: the client is untrusted. It may only tell the server WHICH
 * tile it revealed, WHICH bet it placed, or "spin". It can never assert a
 * multiplier, a win amount, or the board. Every outcome is resolved here from a
 * CSPRNG at bet time, stored SECRET on the session, and every payout is computed
 * server-side from that hidden state. There is deliberately no endpoint that
 * credits a client-supplied amount.
 */
const POKER_MIN_BUYIN = 100;

export class GameService {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: GameSessionRepository,
        private readonly transactions: TransactionRepository,
        private readonly strategies: GameStrategyFactory
    ) {}

    /* ------------------------------------------------------------------ start */

    async startGame(
        userId: string,
        amount: number,
        gameType: GameType,
        gameConfig?: Record<string, unknown>
    ) {
        const error = new CompositeValidator()
            .add(new PositiveNumberValidator(amount, "Invalid bet amount"))
            .add(new RequiredValidator(gameType, "Game type is required"))
            .validate();
        if (error) throw AppError.badRequest(error);

        if (!this.strategies.isSupported(gameType)) {
            throw AppError.badRequest("Unsupported game type");
        }

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const existingSession = await this.sessions.findActiveByUserAndType(userId, gameType);
        if (existingSession) {
            throw AppError.badRequest("You already have an active game session", {
                sessionId: existingSession._id,
            });
        }

        // Resolve the SECRET outcome + the SAFE (non-secret) config from the
        // client's requested settings. Anything the client sends beyond these
        // sanitized fields (e.g. a board) is ignored.
        const { outcome, safeConfig } = this.resolveOutcome(gameType, gameConfig || {});

        // Atomic debit: succeeds only if the balance covers the stake, so two
        // concurrent bets can never overdraw the same wallet.
        const totals = await this.users.tryDebit(userId, amount);
        if (!totals) throw AppError.badRequest("Insufficient balance");

        const serverSeed = crypto.randomBytes(32).toString("hex");

        let session;
        try {
            session = await this.sessions.create({
                userId: user._id,
                gameType,
                betAmount: amount,
                gameConfig: safeConfig,
                outcome,
                revealed: [],
                floor: 0,
                multiplier: 1,
                serverSeed,
                status: "ACTIVE",
            });
        } catch (err: unknown) {
            // A concurrent /start won the unique-active-session index race — refund
            // this debit and surface the same "already active" error.
            if ((err as { code?: number }).code === 11000) {
                await this.users.creditWallet(userId, amount, amount);
                const active = await this.sessions.findActiveByUserAndType(userId, gameType);
                throw AppError.badRequest("You already have an active game session", {
                    sessionId: active?._id,
                });
            }
            throw err;
        }

        await this.transactions.create({
            userId: user._id,
            type: "BET",
            gameType,
            gameId: session._id.toString(),
            amount: -amount,
            balanceAfter: totals.walletBalance,
            meta: { betAmount: amount },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        });

        return {
            message: "Game started",
            sessionId: session._id,
            newBalance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        };
    }

    /** Build the hidden outcome + the safe stored config for a game type. */
    private resolveOutcome(
        gameType: GameType,
        config: Record<string, unknown>
    ): { outcome: Record<string, unknown>; safeConfig: Record<string, unknown> } {
        switch (gameType) {
            case "MINES": {
                const mineCount = Math.max(
                    MINES_MIN,
                    Math.min(MINES_MAX, Math.floor(Number(config.mineCount)) || 3)
                );
                return { outcome: { mines: generateMines(mineCount) }, safeConfig: { mineCount } };
            }
            case "DRAGON_TOWER": {
                const difficulty = ["Low", "Medium", "High"].includes(String(config.difficulty))
                    ? String(config.difficulty)
                    : "Low";
                const tilesPerRow = DRAGON_TILES[difficulty];
                return {
                    outcome: { dragons: generateDragons(tilesPerRow) },
                    safeConfig: { difficulty, tilesPerRow },
                };
            }
            case "WHEEL": {
                const risk = ["low", "medium", "hard"].includes(String(config.risk))
                    ? String(config.risk)
                    : "medium";
                const segments = [10, 20, 30, 40].includes(Number(config.segments))
                    ? Number(config.segments)
                    : 20;
                return { outcome: {}, safeConfig: { risk, segments } };
            }
            case "ROULETTE":
            default:
                return { outcome: {}, safeConfig: {} };
        }
    }

    /* ------------------------------------------------------------ mines play */

    async revealMines(userId: string, sessionId: string, tileIndex: number) {
        const session = await this.sessions.findActiveByIdForUserWithOutcome(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");
        if (session.gameType !== "MINES") throw AppError.badRequest("Not a mines session");

        const idx = Math.floor(Number(tileIndex));
        if (!(idx >= 0 && idx < MINES_TILE_COUNT)) throw AppError.badRequest("Invalid tile");
        if (session.revealed.includes(idx)) throw AppError.badRequest("Tile already revealed");

        const mines = (session.outcome?.mines as number[]) || [];
        const mineCount = Number((session.gameConfig as Record<string, unknown>).mineCount) || mines.length;

        if (mines.includes(idx)) {
            // BOOM — the server's planted mine. Settle the loss; reveal the board.
            session.status = "LOST";
            session.actualWin = 0;
            session.multiplier = 0;
            session.completedAt = new Date();
            await this.sessions.save(session);
            return { hit: true, tileIndex: idx, mines, gemsRevealed: session.revealed };
        }

        session.revealed.push(idx);
        const safeReveals = session.revealed.length;
        const multiplier = minesMultiplier(mineCount, safeReveals);
        session.multiplier = multiplier;
        session.potentialWin = session.betAmount * multiplier;
        await this.sessions.save(session);

        return {
            hit: false,
            tileIndex: idx,
            safeReveals,
            multiplier,
            potentialWin: session.potentialWin,
        };
    }

    /* ------------------------------------------------------- dragon tower play */

    async revealDragon(userId: string, sessionId: string, tileIndex: number) {
        const session = await this.sessions.findActiveByIdForUserWithOutcome(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");
        if (session.gameType !== "DRAGON_TOWER") throw AppError.badRequest("Not a dragon tower session");

        const cfg = session.gameConfig as Record<string, unknown>;
        const tilesPerRow = Number(cfg.tilesPerRow) || DRAGON_TILES[String(cfg.difficulty)] || 4;
        const dragons = (session.outcome?.dragons as number[]) || [];
        const floor = session.floor;

        if (floor >= DRAGON_ROWS) throw AppError.badRequest("Tower already topped out");
        const idx = Math.floor(Number(tileIndex));
        if (!(idx >= 0 && idx < tilesPerRow)) throw AppError.badRequest("Invalid tile");

        if (dragons[floor] === idx) {
            session.status = "LOST";
            session.actualWin = 0;
            session.multiplier = 0;
            session.completedAt = new Date();
            await this.sessions.save(session);
            return { hit: true, floor, dragons, tileIndex: idx };
        }

        session.revealed.push(idx);
        session.floor = floor + 1;
        const multiplier = dragonMultiplier(tilesPerRow, session.floor);
        session.multiplier = multiplier;
        session.potentialWin = session.betAmount * multiplier;
        await this.sessions.save(session);

        return {
            hit: false,
            tileIndex: idx,
            floor: session.floor,
            multiplier,
            potentialWin: session.potentialWin,
            maxed: session.floor >= DRAGON_ROWS,
        };
    }

    /* ------------------------------------------------------------ wheel spin */

    async spinWheel(userId: string, sessionId: string) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");
        if (session.gameType !== "WHEEL") throw AppError.badRequest("Not a wheel session");

        const cfg = session.gameConfig as Record<string, unknown>;
        const { index, multiplier } = spinWheelOutcome(String(cfg.risk), Number(cfg.segments));
        const payout = Math.round(session.betAmount * multiplier * 100) / 100;

        const totals = await this.settle(session, userId, payout, multiplier);
        return { index, multiplier, payout, newBalance: totals.walletBalance };
    }

    /* --------------------------------------------------------- roulette spin */

    async spinRoulette(userId: string, sessionId: string, bets: RouletteBetInput[]) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");
        if (session.gameType !== "ROULETTE") throw AppError.badRequest("Not a roulette session");
        if (!Array.isArray(bets) || bets.length === 0) throw AppError.badRequest("No bets");

        // Reconstruct authoritative numbers + multipliers from the bet KEYS only.
        const resolved: ResolvedRouletteBet[] = [];
        let total = 0;
        for (const b of bets) {
            const r = resolveRouletteBet(b?.key, Number(b?.amount));
            if (!r) throw AppError.badRequest("Invalid bet");
            resolved.push(r);
            total += r.amount;
        }
        // The staked total must match what was actually deducted at start —
        // otherwise the client is trying to "win" on money it never wagered.
        if (Math.abs(total - session.betAmount) > 0.01) {
            throw AppError.badRequest("Bet total does not match the placed stake");
        }

        const { index, number } = spinRouletteOutcome();
        let won = 0;
        for (const r of resolved) if (r.numbers.includes(number)) won += r.amount * r.mult;
        won = Math.round(won * 100) / 100;
        const multiplier = session.betAmount > 0 ? won / session.betAmount : 0;

        const totals = await this.settle(session, userId, won, multiplier);
        return { index, number, won, newBalance: totals.walletBalance };
    }

    /* ------------------------------------------------------------- cash out */

    async cashOut(userId: string, sessionId: string) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");

        // A cash-out below 1.00x means nothing was revealed/climbed — reject it
        // so the UI can't fabricate a "walk-away" win on an untouched board.
        if (session.multiplier <= 1) {
            throw AppError.badRequest("Reveal at least one tile before cashing out");
        }

        const winAmount = Math.round(session.betAmount * session.multiplier * 100) / 100;
        const totals = await this.settle(session, userId, winAmount, session.multiplier);

        return {
            message: "Cashed out successfully",
            winAmount,
            multiplier: session.multiplier,
            newBalance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        };
    }

    /**
     * Shared settlement, EXACTLY ONCE. Atomically flips the session ACTIVE→terminal
     * (so 100 concurrent cash-outs pay once), then credits the wallet with an
     * atomic $inc. The stake was already debited at bet time, so a win credits the
     * full return and a loss credits nothing.
     */
    private async settle(
        session: GameSessionDoc,
        userId: string,
        payout: number,
        multiplier: number
    ): Promise<WalletTotals> {
        const status = payout > 0 ? "CASHED_OUT" : "LOST";
        const claimed = await this.sessions.claimForSettle(session._id.toString(), userId, status);
        if (!claimed) throw AppError.badRequest("This round was already settled");

        claimed.actualWin = payout;
        claimed.multiplier = multiplier;
        await this.sessions.save(claimed);

        if (payout > 0) {
            const totals = await this.users.creditWallet(userId, payout, payout);
            if (!totals) throw AppError.notFound("User not found");

            await this.transactions.create({
                userId: claimed.userId,
                type: "WIN",
                gameType: claimed.gameType as GameType,
                gameId: claimed._id.toString(),
                amount: payout,
                balanceAfter: totals.walletBalance,
                meta: { betAmount: claimed.betAmount, multiplier },
            });

            eventBus.publish(DomainEvent.LeaderboardChanged, {});
            eventBus.publish(DomainEvent.TransactionRecorded, { userId });
            eventBus.publish(DomainEvent.WalletUpdated, {
                userId,
                balance: totals.walletBalance,
                totalEarnings: totals.totalEarnings,
            });
            return totals;
        }

        // Loss: nothing to credit — read current balance via a no-op $inc.
        const totals = await this.users.creditWallet(userId, 0, 0);
        return totals ?? { walletBalance: 0, totalEarnings: 0 };
    }

    /* ----------------------------------------------------------- lose / refund */

    async loseGame(userId: string, sessionId: string) {
        // Atomic + idempotent: whoever flips ACTIVE→LOST first wins; a duplicate
        // forfeit just no-ops. Stake already left P&L at bet time — nothing to book.
        const claimed = await this.sessions.claimForSettle(sessionId, userId, "LOST");
        if (claimed) {
            claimed.actualWin = 0;
            await this.sessions.save(claimed);
            return { message: "Game ended", result: "LOST", lostAmount: claimed.betAmount };
        }
        return { message: "Game already ended", result: "LOST" };
    }

    /**
     * Refund an unplayed stake (e.g. leaving a poker waiting room before the
     * game starts). Credits the bet back and stamps the ledger REFUND — never a win.
     */
    async refund(userId: string, gameType: GameType, sessionId?: string) {
        const target = sessionId
            ? await this.sessions.findActiveByIdForUser(sessionId, userId)
            : await this.sessions.findLatestActive(userId, gameType);
        if (!target) throw AppError.notFound("Active game session not found");

        // Atomically claim the session so a double-fire can't refund twice.
        const session = await this.sessions.claimForSettle(target._id.toString(), userId, "CASHED_OUT");
        if (!session) throw AppError.badRequest("This session was already settled");

        const refundAmount = session.betAmount;
        session.actualWin = refundAmount;
        session.multiplier = 1;
        await this.sessions.save(session);

        // undo the stake's P&L hit — net-zero round (atomic $inc)
        const totals = await this.users.creditWallet(userId, refundAmount, refundAmount);
        if (!totals) throw AppError.notFound("User not found");

        await this.transactions.create({
            userId: session.userId,
            type: "REFUND",
            gameType: session.gameType as GameType,
            gameId: session._id.toString(),
            amount: refundAmount,
            balanceAfter: totals.walletBalance,
            meta: { betAmount: session.betAmount, description: "Stake refunded" },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        });

        return {
            message: "Stake refunded",
            refundAmount,
            newBalance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        };
    }

    /* --------------------------------------------------------------- poker */

    /**
     * POKER BUY-IN — authenticated HTTP; SAFE because it moves the user's OWN
     * money OUT (a debit, never a credit-of-a-client-named-amount). Deducts the
     * buy-in, opens an ACTIVE POKER session, and mints a SECRET `seatToken`.
     *
     * MONEY TOUCHPOINT: this is the ONLY place a poker player is debited. The
     * seatToken is the single thing the (untrusted) socket layer ever learns; it
     * lets the realtime path record an authoritative final stack keyed to THIS
     * session, which pokerSettle later reads back and credits. The socket path
     * itself never mutates a wallet.
     */
    async pokerBuyIn(userId: string, amount: number) {
        const amt = Math.floor(Number(amount));
        if (!Number.isFinite(amt) || amt < POKER_MIN_BUYIN) {
            throw AppError.badRequest(`Minimum buy-in is ${POKER_MIN_BUYIN}`);
        }

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        // Atomic, server-authoritative debit — the client can't buy in on money
        // it doesn't have, and two concurrent buy-ins can't overdraw.
        const totals = await this.users.tryDebit(userId, amt);
        if (!totals) throw AppError.badRequest("Insufficient balance");

        const seatToken = crypto.randomBytes(16).toString("hex");
        const serverSeed = crypto.randomBytes(32).toString("hex");

        let session;
        try {
            session = await this.sessions.create({
                userId: user._id,
                gameType: "POKER",
                betAmount: amt,
                gameConfig: {},
                seatToken, // SECRET (select:false) — handed only to this one client
                serverSeed,
                status: "ACTIVE",
            });
        } catch (err: unknown) {
            // Already at a table (or a stale session) — refund this debit and ask
            // the player to leave the current table first. Never leave money burnt.
            if ((err as { code?: number }).code === 11000) {
                await this.users.creditWallet(userId, amt, amt);
                throw AppError.badRequest("You're already seated at a table — leave it before buying in again.");
            }
            throw err;
        }

        await this.transactions.create({
            userId: user._id,
            type: "BET",
            gameType: "POKER",
            gameId: session._id.toString(),
            amount: -amt,
            balanceAfter: totals.walletBalance,
            meta: { betAmount: amt, description: "Poker buy-in" },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        });

        return {
            sessionId: session._id,
            seatToken,
            newBalance: totals.walletBalance,
            totalEarnings: totals.totalEarnings,
        };
    }

    /**
     * POKER CASH-OUT — authenticated HTTP. CRITICAL INVARIANT: the credited
     * amount is the SERVER's authoritative final stack (recorded by the realtime
     * layer under this session's seatToken), never a number from the client.
     *
     * The `poker` service singleton is passed in by the controller (from the
     * container) so this service never imports the container — no dependency
     * cycle. Idempotent: a second call on an already-settled session finds no
     * ACTIVE session and 404s. If the seat hasn't been finalized yet (the leave
     * event is still racing the HTTP call), we leave the session ACTIVE and
     * return `ready:false` so the client retries — we never default to 0.
     */
    async pokerSettle(userId: string, sessionId: string, poker: PokerService) {
        const session = await this.sessions.findActiveByIdForUserWithSeatToken(sessionId, userId);
        if (!session) throw AppError.notFound("Active poker session not found");
        if (session.gameType !== "POKER") throw AppError.badRequest("Not a poker session");

        // Peek WITHOUT consuming — if the seat isn't finalized yet, we must not
        // flip the session or burn the stack; the client retries.
        const finalStack = session.seatToken ? poker.peekFinalStack(session.seatToken) : undefined;

        if (finalStack === undefined) {
            const cur = await this.users.creditWallet(userId, 0, 0); // read current
            return {
                ready: false,
                credited: 0,
                newBalance: cur?.walletBalance ?? 0,
                totalEarnings: cur?.totalEarnings ?? 0,
            };
        }

        // Atomically claim the session so a double-fire settles exactly once.
        const claimed = await this.sessions.claimForSettle(sessionId, userId, "CASHED_OUT");
        if (!claimed) throw AppError.badRequest("This poker session was already settled");

        // We won the claim — now consume the stack (ours alone) and credit it.
        const stack = session.seatToken ? poker.takeFinalStack(session.seatToken) : finalStack;
        const credited = Math.max(0, Math.floor(stack ?? finalStack)); // SERVER value only

        claimed.actualWin = credited;
        claimed.multiplier = claimed.betAmount > 0 ? credited / claimed.betAmount : 0;
        await this.sessions.save(claimed);

        let totals: WalletTotals | null;
        if (credited > 0) {
            totals = await this.users.creditWallet(userId, credited, credited);
            if (!totals) throw AppError.notFound("User not found");

            await this.transactions.create({
                userId: claimed.userId,
                type: "WIN",
                gameType: "POKER",
                gameId: claimed._id.toString(),
                amount: credited,
                balanceAfter: totals.walletBalance,
                meta: { betAmount: claimed.betAmount, description: "Poker cash-out" },
            });

            eventBus.publish(DomainEvent.LeaderboardChanged, {});
            eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        } else {
            totals = await this.users.creditWallet(userId, 0, 0);
        }

        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: totals?.walletBalance ?? 0,
            totalEarnings: totals?.totalEarnings ?? 0,
        });

        return {
            ready: true,
            credited,
            newBalance: totals?.walletBalance ?? 0,
            totalEarnings: totals?.totalEarnings ?? 0,
        };
    }

    /* -------------------------------------------------------- active session */

    /** Sanitized resume payload — NEVER leaks the outcome (mine/dragon positions). */
    async getActiveSession(userId: string, gameType?: GameType) {
        const session = await this.sessions.findLatestActive(userId, gameType);
        if (!session) return { active: false };

        return {
            active: true,
            sessionId: session._id,
            gameType: session.gameType,
            betAmount: session.betAmount,
            multiplier: session.multiplier,
            gameConfig: session.gameConfig, // safe config only (no board)
            revealed: session.revealed,
            floor: session.floor,
            startTime: session.createdAt,
        };
    }
}
