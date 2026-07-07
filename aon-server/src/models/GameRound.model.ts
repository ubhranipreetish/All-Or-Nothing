import { Schema, model } from "mongoose";

export interface IGameRound {
    gameType: "ROULETTE" | "AON" | "DICE" | "MINES" | "DRAGON_TOWER" | "WHEEL" | "POKER";
    result: Schema.Types.Mixed;
    startedAt: Date;
    endedAt?: Date;
}

const GameRoundSchema = new Schema<IGameRound>(
    {
        gameType: {
            type: String,
            enum: ["ROULETTE", "AON", "DICE", "MINES", "DRAGON_TOWER", "WHEEL", "POKER"],
            required: true,
        },
        result: {
            type: Schema.Types.Mixed,
        },
        startedAt: {
            type: Date,
            default: Date.now,
        },
        endedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

export default model<IGameRound>("GameRound", GameRoundSchema);
