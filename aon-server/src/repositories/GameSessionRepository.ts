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

    findLatestActive(userId: string, gameType?: GameType) {
        const query: Record<string, unknown> = { userId, status: "ACTIVE" };
        if (gameType) query.gameType = gameType;
        return GameSession.findOne(query).sort({ createdAt: -1 }).exec();
    }
}
