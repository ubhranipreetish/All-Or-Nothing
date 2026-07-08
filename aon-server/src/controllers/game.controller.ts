import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";
import { GameType } from "../domain/games/GameStrategy";

/** POST /api/game/start — open a tracked session and deduct the bet. */
export const startGame = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { amount, gameType, gameConfig } = req.body as {
        amount: number;
        gameType: GameType;
        gameConfig?: Record<string, unknown>;
    };
    const result = await container.gameService.startGame(userId, amount, gameType, gameConfig);
    res.status(201).json(result);
});

/** POST /api/game/update-multiplier — track the server-side multiplier mid-game. */
export const updateMultiplier = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId, multiplier } = req.body as { sessionId: string; multiplier: number };
    const result = await container.gameService.updateMultiplier(userId, sessionId, multiplier);
    res.json(result);
});

/** POST /api/game/cashout — settle the session at the tracked multiplier. */
export const cashOut = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId: string };
    const result = await container.gameService.cashOut(userId, sessionId);
    res.json(result);
});

/** POST /api/game/refund — return an unplayed stake (e.g. poker waiting-room exit). */
export const refund = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { gameType, sessionId } = req.body as { gameType: GameType; sessionId?: string };
    const result = await container.gameService.refund(userId, gameType, sessionId);
    res.json(result);
});

/** POST /api/game/lose — end the session as a loss. */
export const loseGame = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId: string };
    const result = await container.gameService.loseGame(userId, sessionId);
    res.json(result);
});

/** GET /api/game/active — fetch the user's active session (if any). */
export const getActiveSession = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { gameType } = req.query as { gameType?: GameType };
    const result = await container.gameService.getActiveSession(userId, gameType);
    res.json(result);
});

// ============ LEGACY ENDPOINTS (backward compatibility) ============

/** POST /api/game/bet — @deprecated use /start. */
export const recordBet = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { amount, gameId, gameType } = req.body as {
        amount: number;
        gameId?: string;
        gameType: GameType;
    };
    const result = await container.gameService.recordBet(userId, amount, gameId, gameType);
    res.status(201).json(result);
});

/** POST /api/game/win — secured win recording validated against an active session. */
export const recordWin = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId, winAmount, betAmount, gameType, multiplier } = req.body as {
        sessionId?: string;
        winAmount: number;
        betAmount: number;
        gameType: GameType;
        multiplier?: number;
    };
    const result = await container.gameService.recordWin(userId, {
        sessionId,
        winAmount,
        betAmount,
        gameType,
        multiplier,
    });
    res.status(201).json(result);
});
