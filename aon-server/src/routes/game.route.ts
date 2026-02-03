import { Router } from "express";
import {
    recordBet,
    recordWin,
    startGame,
    updateMultiplier,
    cashOut,
    loseGame
} from "../controllers/game.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All game routes are protected
router.use(protect);

// New secure endpoints
router.post("/start", startGame);
router.post("/update-multiplier", updateMultiplier);
router.post("/cashout", cashOut);
router.post("/lose", loseGame);

// Legacy endpoints (secured with session validation)
router.post("/bet", recordBet);
router.post("/win", recordWin);

export default router;
