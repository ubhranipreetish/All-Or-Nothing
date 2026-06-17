import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** POST /api/wallet/deposit */
export const deposit = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { amount } = req.body as { amount: number };
    const result = await container.walletService.deposit(userId, amount);
    res.status(201).json(result);
});

/** GET /api/wallet/balance */
export const getBalance = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.walletService.getBalance(userId);
    res.json(result);
});
