import { Request, Response } from "express";
import Transaction from "../models/Transaction.model";

/**
 * Get user's transaction history with pagination and filtering
 * GET /api/transactions/me
 * Query params: page, limit, type
 */
export const getUserTransactions = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Max 100 per page
        const type = req.query.type as string;

        // Build query
        const query: Record<string, unknown> = { userId };

        if (type && ["BET", "WIN", "DEPOSIT", "WITHDRAW"].includes(type.toUpperCase())) {
            query.type = type.toUpperCase();
        }

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Transaction.countDocuments(query),
        ]);

        const totalPages = Math.ceil(total / limit);

        res.json({
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        });
    } catch (error) {
        console.error("Get Transactions Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
