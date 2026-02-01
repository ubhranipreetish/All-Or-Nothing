import { Request, Response } from "express";
import User from "../models/User.model";
import Transaction from "../models/Transaction.model";

/**
 * Deposit funds to wallet
 * POST /api/wallet/deposit
 */
export const deposit = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount } = req.body as { amount: number };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid deposit amount" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add deposit amount to wallet
        const newBalance = user.walletBalance + amount;
        user.walletBalance = newBalance;
        await user.save();

        // Create DEPOSIT transaction
        const transaction = await Transaction.create({
            userId,
            type: "DEPOSIT",
            amount: amount, // Positive for credit
            balanceAfter: newBalance,
        });

        res.status(201).json({
            message: "Deposit successful",
            transaction,
            newBalance,
        });
    } catch (error) {
        console.error("Deposit Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Get current wallet balance
 * GET /api/wallet/balance
 */
export const getBalance = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await User.findById(userId).select("walletBalance totalEarnings");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            walletBalance: user.walletBalance,
            totalEarnings: user.totalEarnings,
        });
    } catch (error) {
        console.error("Get Balance Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
