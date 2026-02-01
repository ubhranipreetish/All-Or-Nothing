import { Request, Response } from "express";
import User from "../models/User.model";
import Transaction from "../models/Transaction.model";

/**
 * Get user profile with wallet summary and biggest win
 * GET /api/profile/me
 */
export const getProfile = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await User.findById(userId).select(
            "name email avatar walletBalance totalEarnings createdAt"
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Get biggest win
        const biggestWin = await Transaction.findOne({
            userId,
            type: "WIN",
        })
            .sort({ amount: -1 })
            .select("amount gameType createdAt meta")
            .lean();

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                createdAt: user.createdAt,
            },
            wallet: {
                balance: user.walletBalance,
                totalEarnings: user.totalEarnings,
            },
            biggestWin: biggestWin
                ? {
                    amount: biggestWin.amount,
                    gameType: biggestWin.gameType,
                    date: biggestWin.createdAt,
                    multiplier: biggestWin.meta?.multiplier,
                }
                : null,
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
