import { Request, Response } from "express";
import crypto from "crypto";
import User from "../models/User.model";
import Transaction from "../models/Transaction.model";
import GameSession from "../models/GameSession.model";
import { emitLeaderboardUpdate, emitTransactionUpdate, emitWalletUpdate } from "../socket";

type GameType = "ROULETTE" | "MINES" | "DRAGON_TOWER" | "WHEEL";

/**
 * Start a game session - Deducts bet and creates tracked session
 * POST /api/game/start
 */
export const startGame = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount, gameType, gameConfig } = req.body as {
            amount: number;
            gameType: GameType;
            gameConfig?: Record<string, unknown>;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid bet amount" });
        }

        if (!gameType) {
            return res.status(400).json({ message: "Game type is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.walletBalance < amount) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Check for existing active session of same game type
        const existingSession = await GameSession.findOne({
            userId,
            gameType,
            status: "ACTIVE",
        });
        if (existingSession) {
            return res.status(400).json({
                message: "You already have an active game session",
                sessionId: existingSession._id,
            });
        }

        // Deduct bet amount from wallet
        const newBalance = user.walletBalance - amount;
        user.walletBalance = newBalance;
        await user.save();

        // Generate server seed for provably fair gaming
        const serverSeed = crypto.randomBytes(32).toString("hex");

        // Create game session
        const session = await GameSession.create({
            userId,
            gameType,
            betAmount: amount,
            gameConfig: gameConfig || {},
            serverSeed,
            status: "ACTIVE",
        });

        // Create BET transaction
        await Transaction.create({
            userId,
            type: "BET",
            gameType,
            gameId: session._id.toString(),
            amount: -amount,
            balanceAfter: newBalance,
            meta: { betAmount: amount },
        });

        // Emit updates
        emitTransactionUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.status(201).json({
            message: "Game started",
            sessionId: session._id,
            newBalance,
        });
    } catch (error) {
        console.error("Start Game Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Update game multiplier during gameplay (for progressive games like Mines)
 * POST /api/game/update-multiplier
 */
export const updateMultiplier = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { sessionId, multiplier } = req.body as {
            sessionId: string;
            multiplier: number;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const session = await GameSession.findOne({
            _id: sessionId,
            userId,
            status: "ACTIVE",
        });

        if (!session) {
            return res.status(404).json({ message: "Active game session not found" });
        }

        // Validate multiplier is reasonable (anti-cheat)
        if (multiplier < 1 || multiplier > 1000) {
            return res.status(400).json({ message: "Invalid multiplier" });
        }

        session.multiplier = multiplier;
        session.potentialWin = session.betAmount * multiplier;
        await session.save();

        res.json({
            message: "Multiplier updated",
            multiplier: session.multiplier,
            potentialWin: session.potentialWin,
        });
    } catch (error) {
        console.error("Update Multiplier Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Cash out - End game and credit winnings based on SERVER-TRACKED multiplier
 * POST /api/game/cashout
 */
export const cashOut = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { sessionId } = req.body as { sessionId: string };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const session = await GameSession.findOne({
            _id: sessionId,
            userId,
            status: "ACTIVE",
        });

        if (!session) {
            return res.status(404).json({ message: "Active game session not found" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Calculate win based on SERVER-TRACKED multiplier (not client-submitted!)
        const winAmount = session.betAmount * session.multiplier;
        const netProfit = winAmount - session.betAmount;

        // Credit win amount
        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;
        user.totalEarnings += netProfit;
        await user.save();

        // Update session
        session.status = "CASHED_OUT";
        session.actualWin = winAmount;
        session.completedAt = new Date();
        await session.save();

        // Create WIN transaction
        await Transaction.create({
            userId,
            type: "WIN",
            gameType: session.gameType,
            gameId: session._id.toString(),
            amount: winAmount,
            balanceAfter: newBalance,
            meta: {
                betAmount: session.betAmount,
                multiplier: session.multiplier,
            },
        });

        // Emit updates
        emitLeaderboardUpdate();
        emitTransactionUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.json({
            message: "Cashed out successfully",
            winAmount,
            multiplier: session.multiplier,
            newBalance,
            totalEarnings: user.totalEarnings,
        });
    } catch (error) {
        console.error("Cash Out Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * End game as loss
 * POST /api/game/lose
 */
export const loseGame = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { sessionId } = req.body as { sessionId: string };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const session = await GameSession.findOne({
            _id: sessionId,
            userId,
            status: "ACTIVE",
        });

        if (!session) {
            return res.status(404).json({ message: "Active game session not found" });
        }

        // Mark as lost
        session.status = "LOST";
        session.actualWin = 0;
        session.completedAt = new Date();
        await session.save();

        res.json({
            message: "Game ended",
            result: "LOST",
        });
    } catch (error) {
        console.error("Lose Game Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Get active game session for the user
 * GET /api/game/active
 */
export const getActiveSession = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { gameType } = req.query as { gameType?: GameType };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const query: any = { userId, status: "ACTIVE" };
        if (gameType) {
            query.gameType = gameType;
        }

        const session = await GameSession.findOne(query).sort({ createdAt: -1 });

        if (!session) {
            return res.status(200).json({ active: false });
        }

        res.json({
            active: true,
            sessionId: session._id,
            gameType: session.gameType,
            betAmount: session.betAmount,
            multiplier: session.multiplier,
            gameConfig: session.gameConfig, // Returns board/dragons state
            startTime: session.createdAt,
        });
    } catch (error) {
        console.error("Get Active Session Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// ============ LEGACY ENDPOINTS (for backward compatibility) ============

/**
 * Record a bet - Deducts from wallet and creates BET transaction
 * POST /api/game/bet
 * @deprecated Use /api/game/start instead
 */
export const recordBet = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount, gameId, gameType } = req.body as {
            amount: number;
            gameId?: string;
            gameType: GameType;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid bet amount" });
        }

        if (!gameType) {
            return res.status(400).json({ message: "Game type is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.walletBalance < amount) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // Deduct bet amount from wallet
        const newBalance = user.walletBalance - amount;
        user.walletBalance = newBalance;
        await user.save();

        // Generate server seed and create session for tracking
        const serverSeed = crypto.randomBytes(32).toString("hex");
        const session = await GameSession.create({
            userId,
            gameType,
            betAmount: amount,
            serverSeed,
            status: "ACTIVE",
        });

        // Create BET transaction
        const transaction = await Transaction.create({
            userId,
            type: "BET",
            gameId: gameId || session._id.toString(),
            gameType,
            amount: -amount,
            balanceAfter: newBalance,
            meta: { betAmount: amount },
        });

        emitTransactionUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.status(201).json({
            message: "Bet recorded successfully",
            transaction,
            sessionId: session._id,
            newBalance,
        });
    } catch (error) {
        console.error("Record Bet Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Record a win - SECURED: Only allows wins for valid active sessions
 * POST /api/game/win
 */
export const recordWin = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { sessionId, winAmount, betAmount, gameType, multiplier } = req.body as {
            sessionId?: string;
            winAmount: number;
            betAmount: number;
            gameType: GameType;
            multiplier?: number;
        };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // SECURITY: Find active session to validate win
        let session;
        if (sessionId) {
            session = await GameSession.findOne({
                _id: sessionId,
                userId,
                status: "ACTIVE",
            });
        } else {
            // Find most recent active session for this game type
            session = await GameSession.findOne({
                userId,
                gameType,
                status: "ACTIVE",
            }).sort({ createdAt: -1 });
        }

        if (!session) {
            return res.status(400).json({
                message: "No active game session found. Place a bet first."
            });
        }

        // SECURITY: Validate win amount against bet amount
        const maxAllowedMultiplier = 100000; // Increased to allow Mines jackpot
        const maxAllowedWin = session.betAmount * maxAllowedMultiplier;

        if (winAmount > maxAllowedWin) {
            console.warn(`Suspicious win attempt: userId=${userId}, claimed=${winAmount}, max=${maxAllowedWin}`);
            return res.status(400).json({
                message: "Invalid win amount"
            });
        }

        // SECURITY: Validate multiplier matches
        const calculatedMultiplier = winAmount / session.betAmount;
        if (multiplier && Math.abs(calculatedMultiplier - multiplier) > 0.01) {
            console.warn(`Multiplier mismatch: userId=${userId}, claimed=${multiplier}, calculated=${calculatedMultiplier}`);
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Credit win amount
        const newBalance = user.walletBalance + winAmount;
        user.walletBalance = newBalance;

        const netProfit = winAmount - session.betAmount;
        user.totalEarnings += netProfit;
        await user.save();

        // Mark session as won
        session.status = "WON";
        session.actualWin = winAmount;
        session.multiplier = calculatedMultiplier;
        session.completedAt = new Date();
        await session.save();

        // Create WIN transaction
        const transaction = await Transaction.create({
            userId,
            type: "WIN",
            gameId: session._id.toString(),
            gameType: session.gameType,
            amount: winAmount,
            balanceAfter: newBalance,
            meta: {
                betAmount: session.betAmount,
                multiplier: calculatedMultiplier,
            },
        });

        emitLeaderboardUpdate();
        emitTransactionUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.status(201).json({
            message: "Win recorded successfully",
            transaction,
            newBalance,
            totalEarnings: user.totalEarnings,
        });
    } catch (error) {
        console.error("Record Win Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
