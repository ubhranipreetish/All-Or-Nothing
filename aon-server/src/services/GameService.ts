import crypto from "crypto";
import { GameStrategyFactory } from "../domain/games/GameStrategyFactory";
import { GameType } from "../domain/games/GameStrategy";
import { GameSessionRepository } from "../repositories/GameSessionRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { eventBus } from "../shared/events/EventBus";
import { DomainEvent } from "../shared/events/DomainEvents";
import { AppError } from "../shared/errors/AppError";
import {
    CompositeValidator,
    PositiveNumberValidator,
    RequiredValidator,
} from "../shared/validation/Validator";

/**
 * GameService
 *
 * Owns the wager lifecycle for every game: place a bet (which deducts the
 * wallet and opens a tracked session), track the server-side multiplier, then
 * settle as a cash-out, win, or loss. Per-game limits come from a
 * {@link GameStrategy} resolved via the factory, and balance/ledger changes are
 * announced as domain events instead of poking Socket.IO directly.
 */
export class GameService {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: GameSessionRepository,
        private readonly transactions: TransactionRepository,
        private readonly strategies: GameStrategyFactory
    ) {}

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

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        if (user.walletBalance < amount) {
            throw AppError.badRequest("Insufficient balance");
        }

        const existingSession = await this.sessions.findActiveByUserAndType(userId, gameType);
        if (existingSession) {
            throw AppError.badRequest("You already have an active game session", {
                sessionId: existingSession._id,
            });
        }

        const newBalance = user.walletBalance - amount;
        user.walletBalance = newBalance;
        // Lifetime P&L: every stake counts as money out the moment it's placed;
        // wins credit the full payout back, so unsettled losses still show.
        user.totalEarnings -= amount;
        await this.users.save(user);

        const serverSeed = crypto.randomBytes(32).toString("hex");

        const session = await this.sessions.create({
            userId: user._id,
            gameType,
            betAmount: amount,
            gameConfig: gameConfig || {},
            serverSeed,
            status: "ACTIVE",
        });

        await this.transactions.create({
            userId: user._id,
            type: "BET",
            gameType,
            gameId: session._id.toString(),
            amount: -amount,
            balanceAfter: newBalance,
            meta: { betAmount: amount },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Game started",
            sessionId: session._id,
            newBalance,
            totalEarnings: user.totalEarnings,
        };
    }

    async updateMultiplier(userId: string, sessionId: string, multiplier: number) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");

        const strategy = this.strategies.create(session.gameType);
        const min = strategy?.minMultiplier ?? 1;
        const max = strategy?.maxMultiplier ?? 1000;
        if (multiplier < min || multiplier > max) {
            throw AppError.badRequest("Invalid multiplier");
        }

        session.multiplier = multiplier;
        session.potentialWin = session.betAmount * multiplier;
        await this.sessions.save(session);

        return {
            message: "Multiplier updated",
            multiplier: session.multiplier,
            potentialWin: session.potentialWin,
        };
    }

    async cashOut(userId: string, sessionId: string) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");

        // A cash-out at 1.00x means nothing was revealed/climbed — that's a
        // no-op round, not a payout. Reject it so the UI can't fake a "win".
        if (session.multiplier <= 1) {
            throw AppError.badRequest("Reveal at least one tile before cashing out");
        }

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        // Win is based on the SERVER-TRACKED multiplier, never a client value.
        const winAmount = session.betAmount * session.multiplier;

        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;
        user.totalEarnings += winAmount;
        await this.users.save(user);

        session.status = "CASHED_OUT";
        session.actualWin = winAmount;
        session.completedAt = new Date();
        await this.sessions.save(session);

        await this.transactions.create({
            userId: user._id,
            type: "WIN",
            gameType: session.gameType as GameType,
            gameId: session._id.toString(),
            amount: winAmount,
            balanceAfter: newBalance,
            meta: { betAmount: session.betAmount, multiplier: session.multiplier },
        });

        eventBus.publish(DomainEvent.LeaderboardChanged, {});
        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Cashed out successfully",
            winAmount,
            multiplier: session.multiplier,
            newBalance,
            totalEarnings: user.totalEarnings,
        };
    }

    async loseGame(userId: string, sessionId: string) {
        const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
        if (!session) throw AppError.notFound("Active game session not found");

        session.status = "LOST";
        session.actualWin = 0;
        session.completedAt = new Date();
        await this.sessions.save(session);

        // The stake already left P&L when the bet was placed — nothing more to book.
        return { message: "Game ended", result: "LOST", lostAmount: session.betAmount };
    }

    /**
     * Refund an unplayed stake (e.g. leaving a poker waiting room before the
     * game starts). Credits the bet back and stamps the ledger REFUND — it is
     * NOT a win and never touches the leaderboard.
     */
    async refund(userId: string, gameType: GameType, sessionId?: string) {
        const session = sessionId
            ? await this.sessions.findActiveByIdForUser(sessionId, userId)
            : await this.sessions.findLatestActive(userId, gameType);
        if (!session) throw AppError.notFound("Active game session not found");

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const refundAmount = session.betAmount;
        const newBalance = user.walletBalance + refundAmount;
        user.walletBalance = newBalance;
        // Undo the stake's P&L hit — a refunded round is a net-zero round.
        user.totalEarnings += refundAmount;
        await this.users.save(user);

        session.status = "CASHED_OUT";
        session.actualWin = refundAmount;
        session.multiplier = 1;
        session.completedAt = new Date();
        await this.sessions.save(session);

        await this.transactions.create({
            userId: user._id,
            type: "REFUND",
            gameType: session.gameType as GameType,
            gameId: session._id.toString(),
            amount: refundAmount,
            balanceAfter: newBalance,
            meta: { betAmount: session.betAmount, description: "Stake refunded" },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Stake refunded",
            refundAmount,
            newBalance,
            totalEarnings: user.totalEarnings,
        };
    }

    async getActiveSession(userId: string, gameType?: GameType) {
        const session = await this.sessions.findLatestActive(userId, gameType);
        if (!session) return { active: false };

        return {
            active: true,
            sessionId: session._id,
            gameType: session.gameType,
            betAmount: session.betAmount,
            multiplier: session.multiplier,
            gameConfig: session.gameConfig,
            startTime: session.createdAt,
        };
    }

    // ============ LEGACY use cases (kept for backward compatibility) ============

    async recordBet(userId: string, amount: number, gameId: string | undefined, gameType: GameType) {
        const error = new CompositeValidator()
            .add(new PositiveNumberValidator(amount, "Invalid bet amount"))
            .add(new RequiredValidator(gameType, "Game type is required"))
            .validate();
        if (error) throw AppError.badRequest(error);

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        if (user.walletBalance < amount) {
            throw AppError.badRequest("Insufficient balance");
        }

        const newBalance = user.walletBalance - amount;
        user.walletBalance = newBalance;
        // Same P&L rule as startGame: stakes count as money out immediately.
        user.totalEarnings -= amount;
        await this.users.save(user);

        const serverSeed = crypto.randomBytes(32).toString("hex");
        const session = await this.sessions.create({
            userId: user._id,
            gameType,
            betAmount: amount,
            serverSeed,
            status: "ACTIVE",
        });

        const transaction = await this.transactions.create({
            userId: user._id,
            type: "BET",
            gameId: gameId || session._id.toString(),
            gameType,
            amount: -amount,
            balanceAfter: newBalance,
            meta: { betAmount: amount },
        });

        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Bet recorded successfully",
            transaction,
            sessionId: session._id,
            newBalance,
            totalEarnings: user.totalEarnings,
        };
    }

    async recordWin(
        userId: string,
        input: {
            sessionId?: string;
            winAmount: number;
            betAmount: number;
            gameType: GameType;
            multiplier?: number;
        }
    ) {
        const { sessionId, winAmount, gameType, multiplier } = input;

        const session = sessionId
            ? await this.sessions.findActiveByIdForUser(sessionId, userId)
            : await this.sessions.findLatestActive(userId, gameType);

        if (!session) {
            throw AppError.badRequest("No active game session found. Place a bet first.");
        }

        // Anti-cheat: reject wins that exceed the per-game ceiling.
        const strategy = this.strategies.create(session.gameType);
        const maxAllowedMultiplier = strategy?.maxWinMultiplier ?? 100000;
        const maxAllowedWin = session.betAmount * maxAllowedMultiplier;

        if (winAmount > maxAllowedWin) {
            console.warn(
                `Suspicious win attempt: userId=${userId}, claimed=${winAmount}, max=${maxAllowedWin}`
            );
            throw AppError.badRequest("Invalid win amount");
        }

        const calculatedMultiplier = winAmount / session.betAmount;
        if (multiplier && Math.abs(calculatedMultiplier - multiplier) > 0.01) {
            console.warn(
                `Multiplier mismatch: userId=${userId}, claimed=${multiplier}, calculated=${calculatedMultiplier}`
            );
        }

        // Mines can never pay <= the stake once a gem is revealed, so a
        // break-even "win" there is a 0-reveal cash-out attempt — reject it.
        if (session.gameType === "MINES" && winAmount <= session.betAmount) {
            throw AppError.badRequest("Reveal at least one tile before cashing out");
        }

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;
        user.totalEarnings += winAmount;
        await this.users.save(user);

        session.status = "WON";
        session.actualWin = winAmount;
        session.multiplier = calculatedMultiplier;
        session.completedAt = new Date();
        await this.sessions.save(session);

        const transaction = await this.transactions.create({
            userId: user._id,
            type: "WIN",
            gameId: session._id.toString(),
            gameType: session.gameType as GameType,
            amount: winAmount,
            balanceAfter: newBalance,
            meta: { betAmount: session.betAmount, multiplier: calculatedMultiplier },
        });

        eventBus.publish(DomainEvent.LeaderboardChanged, {});
        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Win recorded successfully",
            transaction,
            newBalance,
            totalEarnings: user.totalEarnings,
        };
    }
}
