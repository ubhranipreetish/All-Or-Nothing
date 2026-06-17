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

        return { message: "Game started", sessionId: session._id, newBalance };
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

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        // Win is based on the SERVER-TRACKED multiplier, never a client value.
        const winAmount = session.betAmount * session.multiplier;
        const netProfit = winAmount - session.betAmount;

        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;
        user.totalEarnings += netProfit;
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

        return { message: "Game ended", result: "LOST" };
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

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;
        const netProfit = winAmount - session.betAmount;
        user.totalEarnings += netProfit;
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
