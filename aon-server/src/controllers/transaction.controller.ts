import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/**
 * GET /api/transactions/me
 * Query params: page, limit (max 100), type (BET|WIN|DEPOSIT|WITHDRAW).
 */
export const getUserTransactions = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const type = req.query.type as string | undefined;

    const result = await container.transactionService.getUserTransactions(userId, page, limit, type);
    res.json(result);
});
