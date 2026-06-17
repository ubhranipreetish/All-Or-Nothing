import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** POST /api/bonus/claim-welcome */
export const claimWelcomeBonus = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.bonusService.claimWelcomeBonus(userId);
    res.status(201).json(result);
});

/** GET /api/bonus/status */
export const getBonusStatus = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.bonusService.getStatus(userId);
    res.json(result);
});
