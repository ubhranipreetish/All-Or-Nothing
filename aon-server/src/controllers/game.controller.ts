import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";
import { GameType } from "../domain/games/GameStrategy";

/** POST /api/game/start — open a tracked session, deduct the bet, resolve the SECRET outcome. */
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

/** POST /api/game/mines/reveal — reveal one tile; server checks its own board. */
export const revealMines = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId, tileIndex } = req.body as { sessionId: string; tileIndex: number };
    const result = await container.gameService.revealMines(userId, sessionId, tileIndex);
    res.json(result);
});

/** POST /api/game/dragon/reveal — pick one tile on the current floor. */
export const revealDragon = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId, tileIndex } = req.body as { sessionId: string; tileIndex: number };
    const result = await container.gameService.revealDragon(userId, sessionId, tileIndex);
    res.json(result);
});

/** POST /api/game/wheel/spin — server picks the segment and settles. */
export const spinWheel = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId: string };
    const result = await container.gameService.spinWheel(userId, sessionId);
    res.json(result);
});

/** POST /api/game/roulette/spin — server picks the number and prices the bets. */
export const spinRoulette = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId, bets } = req.body as {
        sessionId: string;
        bets: { key: string; amount: number }[];
    };
    const result = await container.gameService.spinRoulette(userId, sessionId, bets);
    res.json(result);
});

/** POST /api/game/cashout — settle at the SERVER-tracked multiplier (mines / dragon tower). */
export const cashOut = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId: string };
    const result = await container.gameService.cashOut(userId, sessionId);
    res.json(result);
});

/** POST /api/game/poker/buyin — debit the user's OWN money, open a POKER session, issue a seatToken. */
export const pokerBuyIn = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { amount } = req.body as { amount: number };
    const result = await container.gameService.pokerBuyIn(userId, amount);
    res.status(201).json(result);
});

/**
 * POST /api/game/poker/settle — credit the SERVER's authoritative final stack.
 * The poker service singleton is handed in from the container so GameService
 * stays free of a container import (no dependency cycle).
 */
export const pokerSettle = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { sessionId } = req.body as { sessionId: string };
    const result = await container.gameService.pokerSettle(userId, sessionId, container.pokerService);
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

/** GET /api/game/active — sanitized resume payload (never leaks the board). */
export const getActiveSession = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { gameType } = req.query as { gameType?: GameType };
    const result = await container.gameService.getActiveSession(userId, gameType);
    res.json(result);
});
