import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** GET /api/wallet/balance */
export const getBalance = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.walletService.getBalance(userId);
    res.json(result);
});
