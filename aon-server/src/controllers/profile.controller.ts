import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** GET /api/profile/me */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.profileService.getProfile(userId);
    res.json(result);
});
