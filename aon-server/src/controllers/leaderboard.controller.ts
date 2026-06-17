import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** GET /api/leaderboard/all-time — public, sorted by net worth. */
export const getAllTimeLeaderboard = asyncHandler(async (_req: Request, res: Response) => {
    const result = await container.leaderboardService.getLeaderboard();
    res.json(result);
});
