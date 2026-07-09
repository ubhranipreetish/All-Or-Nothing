import { HydratedDocument } from "mongoose";
import GameSession, { IGameSession } from "../models/GameSession.model";
import { GameType } from "../domain/games/GameStrategy";

export type GameSessionDoc = HydratedDocument<IGameSession>;

/**
 * GameSessionRepository (Repository pattern)
 *
 * All reads/writes for in-flight game sessions live here. The "active session"
 * lookups encode the security rule that a session must belong to the requesting
 * user and still be ACTIVE.
 */
export interface GameSessionRepository {
    create(data: Partial<IGameSession>): Promise<GameSessionDoc>;
    save(session: GameSessionDoc): Promise<GameSessionDoc>;
    findActiveByUserAndType(userId: string, gameType: GameType): Promise<GameSessionDoc | null>;
    findActiveByIdForUser(sessionId: string, userId: string): Promise<GameSessionDoc | null>;
    /** Same as findActiveByIdForUser but ALSO loads the secret `outcome` (gameplay paths). */
    findActiveByIdForUserWithOutcome(sessionId: string, userId: string): Promise<GameSessionDoc | null>;
    /** Same as findActiveByIdForUser but ALSO loads the secret `seatToken` (poker cash-out). */
    findActiveByIdForUserWithSeatToken(sessionId: string, userId: string): Promise<GameSessionDoc | null>;
    /**
     * Atomically flip an ACTIVE session to a terminal state and return it — or
     * null if it was already settled by a concurrent request. This is the
     * exactly-once guard behind every payout: only the request that WINS this
     * flip is allowed to credit, so 100 parallel cash-outs pay exactly once.
     */
    claimForSettle(
        sessionId: string,
        userId: string,
        status: "CASHED_OUT" | "LOST"
    ): Promise<GameSessionDoc | null>;
    findLatestActive(userId: string, gameType?: GameType): Promise<GameSessionDoc | null>;
}

export class MongoGameSessionRepository implements GameSessionRepository {
    create(data: Partial<IGameSession>) {
        return GameSession.create(data);
    }

    save(session: GameSessionDoc) {
        return session.save();
    }

    findActiveByUserAndType(userId: string, gameType: GameType) {
        return GameSession.findOne({ userId, gameType, status: "ACTIVE" }).exec();
    }

    findActiveByIdForUser(sessionId: string, userId: string) {
        return GameSession.findOne({ _id: sessionId, userId, status: "ACTIVE" }).exec();
    }

    findActiveByIdForUserWithOutcome(sessionId: string, userId: string) {
        return GameSession.findOne({ _id: sessionId, userId, status: "ACTIVE" })
            .select("+outcome")
            .exec();
    }

    findActiveByIdForUserWithSeatToken(sessionId: string, userId: string) {
        return GameSession.findOne({ _id: sessionId, userId, status: "ACTIVE" })
            .select("+seatToken")
            .exec();
    }

    claimForSettle(sessionId: string, userId: string, status: "CASHED_OUT" | "LOST") {
        return GameSession.findOneAndUpdate(
            { _id: sessionId, userId, status: "ACTIVE" },
            { $set: { status, completedAt: new Date() } },
            { new: true }
        ).exec();
    }

    findLatestActive(userId: string, gameType?: GameType) {
        const query: Record<string, unknown> = { userId, status: "ACTIVE" };
        if (gameType) query.gameType = gameType;
        return GameSession.findOne(query).sort({ createdAt: -1 }).exec();
    }
}
