import { Request, Response } from "express";
import User from "../models/User.model";
import Transaction from "../models/Transaction.model";

const WELCOME_BONUS_AMOUNT = 100;

/**
 * Claim welcome bonus - One-time ₹100 for new users
 * POST /api/bonus/claim-welcome
 */
export const claimWelcomeBonus = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if already claimed
        if (user.hasClaimed100Bonus) {
            return res.status(400).json({
                message: "Welcome bonus already claimed",
                alreadyClaimed: true
            });
        }

        // Add bonus to wallet
        const newBalance = user.walletBalance + WELCOME_BONUS_AMOUNT;
        user.walletBalance = newBalance;
        user.hasClaimed100Bonus = true;
        await user.save();

        // Create BONUS transaction
        const transaction = await Transaction.create({
            userId,
            type: "DEPOSIT",
            amount: WELCOME_BONUS_AMOUNT,
            balanceAfter: newBalance,
            meta: {
                bonusType: "WELCOME_100",
                description: "Welcome bonus - ₹100 free credits",
            },
        });

        res.status(201).json({
            message: "Welcome bonus claimed successfully!",
            bonus: WELCOME_BONUS_AMOUNT,
            newBalance,
            transaction,
        });
    } catch (error) {
        console.error("Claim Bonus Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Check bonus status
 * GET /api/bonus/status
 */
export const getBonusStatus = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await User.findById(userId).select("hasClaimed100Bonus");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            hasClaimed100Bonus: user.hasClaimed100Bonus,
        });
    } catch (error) {
        console.error("Get Bonus Status Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
