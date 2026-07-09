import mongoose, { Schema } from "mongoose";

export interface IGameSession {
    userId: mongoose.Types.ObjectId;
    gameType: string;
    betAmount: number;
    gameConfig: Record<string, unknown>; // Safe, non-secret config (mine COUNT, difficulty, risk) — never the board
    /**
     * SERVER-AUTHORITATIVE, SECRET outcome resolved at bet time (mine positions,
     * dragon rows, wheel/roulette result). Never sent to the client. `select:false`
     * so it can't leak through an accidental find().
     */
    outcome?: Record<string, unknown>;
    revealed: number[]; // safe reveals so far (mines: tile indices; dragon: chosen tile per floor)
    floor: number; // dragon tower: current floor reached
    status: "ACTIVE" | "WON" | "LOST" | "CASHED_OUT";
    /**
     * POKER only. A per-buy-in SECRET issued at buy-in and handed to exactly one
     * client. The (untrusted) socket layer echoes it back so the server can tie a
     * live table seat to THIS session and record its authoritative final stack.
     * `select:false` so it can never leak through an accidental find().
     */
    seatToken?: string;
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
        outcome: {
            type: Schema.Types.Mixed,
            default: {},
            select: false, // secret — never returned unless explicitly asked for
        },
        revealed: {
            type: [Number],
            default: [],
        },
        floor: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "WON", "LOST", "CASHED_OUT"],
            default: "ACTIVE",
        },
        seatToken: {
            type: String,
            select: false, // secret — never returned unless explicitly asked for (+seatToken)
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

// At most ONE active session per user per game. This turns the "already have an
// active session" check into a hard DB guarantee, so two concurrent /start calls
// can't both create a session (and double-debit) — the loser hits a duplicate-key
// error the service handles by refunding and returning the active-session error.
GameSessionSchema.index(
    { userId: 1, gameType: 1 },
    { unique: true, partialFilterExpression: { status: "ACTIVE" } }
);

// Auto-expire old active sessions after 1 hour
GameSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600, partialFilterExpression: { status: "ACTIVE" } });

export default mongoose.model<IGameSession>("GameSession", GameSessionSchema);
