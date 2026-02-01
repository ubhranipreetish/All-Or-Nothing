import { Request, Response } from "express";
import User from "../models/User.model";
import Transaction from "../models/Transaction.model";
import { getIO } from "../socket";

type GameType = "ROULETTE" | "AON" | "DICE" | "MINES" | "DRAGON_TOWER" | "WHEEL";

/**
 * Record a bet - Deducts from wallet and creates BET transaction
 * POST /api/game/bet
 */
export const recordBet = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount, gameId, gameType } = req.body as {
            amount: number;
            gameId?: string;
            gameType: GameType;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid bet amount" });
        }

        if (!gameType) {
            return res.status(400).json({ message: "Game type is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.walletBalance < amount) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Deduct bet amount from wallet
        const newBalance = user.walletBalance - amount;
        user.walletBalance = newBalance;
        await user.save();

        // Create BET transaction
        const transaction = await Transaction.create({
            userId,
            type: "BET",
            gameId,
            gameType,
            amount: -amount, // Negative for debit
            balanceAfter: newBalance,
            meta: {
                betAmount: amount,
            },
        });

        res.status(201).json({
            message: "Bet recorded successfully",
            transaction,
            newBalance,
        });
    } catch (error) {
        console.error("Record Bet Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Record a win - Credits to wallet, updates earnings, creates WIN transaction
 * POST /api/game/win
 */
export const recordWin = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { winAmount, betAmount, gameId, gameType, multiplier, result } = req.body as {
            winAmount: number;
            betAmount: number;
            gameId?: string;
            gameType: GameType;
            multiplier?: number;
            result?: string;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!winAmount || winAmount <= 0) {
            return res.status(400).json({ message: "Invalid win amount" });
        }

        if (!gameType) {
            return res.status(400).json({ message: "Game type is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Credit win amount to wallet
        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;

        // Update total earnings (net profit = winAmount - betAmount)
        const netProfit = winAmount - (betAmount || 0);
        user.totalEarnings += netProfit;
        await user.save();

        // Create WIN transaction
        const transaction = await Transaction.create({
            userId,
            type: "WIN",
            gameId,
            gameType,
            amount: winAmount, // Positive for credit
            balanceAfter: newBalance,
            meta: {
                betAmount,
                multiplier,
                result,
            },
        });

        // Emit real-time leaderboard update
        try {
            const io = getIO();
            io.emit("leaderboard:update", {
                userId: user._id,
                username: user.name,
                totalEarnings: user.totalEarnings,
            });
        } catch {
            // Socket.IO not initialized, skip emit
        }

        res.status(201).json({
            message: "Win recorded successfully",
            transaction,
            newBalance,
            totalEarnings: user.totalEarnings,
        });
    } catch (error) {
        console.error("Record Win Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
