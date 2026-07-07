import mongoose, { Schema } from "mongoose";

export interface IGameSession {
    userId: mongoose.Types.ObjectId;
    gameType: string;
    betAmount: number;
    gameConfig: Record<string, unknown>; // Game-specific config (mines count, difficulty, etc.)
    status: "ACTIVE" | "WON" | "LOST" | "CASHED_OUT";
    serverSeed: string; // For provably fair gaming
    multiplier: number;
    potentialWin: number;
    actualWin: number;
    createdAt: Date;
    completedAt?: Date;
}

const GameSessionSchema = new Schema<IGameSession>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        gameType: {
            type: String,
            required: true,
            enum: ["ROULETTE", "MINES", "DRAGON_TOWER", "WHEEL", "POKER"],
        },
        betAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        gameConfig: {
            type: Schema.Types.Mixed,
            default: {},
        },
        status: {
            type: String,
            enum: ["ACTIVE", "WON", "LOST", "CASHED_OUT"],
            default: "ACTIVE",
        },
        serverSeed: {
            type: String,
            required: true,
        },
        multiplier: {
            type: Number,
            default: 1,
        },
        potentialWin: {
            type: Number,
            default: 0,
        },
        actualWin: {
            type: Number,
            default: 0,
        },
        completedAt: Date,
    },
    { timestamps: true }
);

// Index for finding active sessions
GameSessionSchema.index({ userId: 1, status: 1 });

// Auto-expire old active sessions after 1 hour
GameSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600, partialFilterExpression: { status: "ACTIVE" } });

export default mongoose.model<IGameSession>("GameSession", GameSessionSchema);
