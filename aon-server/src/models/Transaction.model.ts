import { Schema, model, Types } from "mongoose";

export interface ITransaction {
    userId: Types.ObjectId;
    type: "BET" | "WIN" | "DEPOSIT" | "WITHDRAW";
    gameId?: string;
    gameType?: "ROULETTE" | "AON" | "DICE" | "MINES" | "DRAGON_TOWER" | "WHEEL";
    amount: number;
    balanceAfter: number;
    meta?: {
        betAmount?: number;
        multiplier?: number;
        result?: string;
        roundId?: string;
        bonusType?: string;
        description?: string;
    };
    createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["BET", "WIN", "DEPOSIT", "WITHDRAW"],
            required: true,
        },
        gameId: {
            type: String,
        },
        gameType: {
            type: String,
            enum: ["ROULETTE", "AON", "DICE", "MINES", "DRAGON_TOWER", "WHEEL"],
        },
        amount: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        meta: {
            betAmount: Number,
            multiplier: Number,
            result: String,
            roundId: String,
            bonusType: String,
            description: String,
        },
    },
    { timestamps: true }
);

// Compound index for efficient user transaction queries
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

export default model<ITransaction>("Transaction", TransactionSchema);
