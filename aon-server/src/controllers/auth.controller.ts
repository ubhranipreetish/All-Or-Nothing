import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/**
 * POST /api/auth/google
 * Thin HTTP adapter: parse the request, delegate to AuthService, send the result.
 */
export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
    const result = await container.authService.loginWithGoogle(req.body?.token);
    res.json(result);
});
