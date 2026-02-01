import { Router } from "express";
import { recordBet, recordWin } from "../controllers/game.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All game routes are protected
router.use(protect);

router.post("/bet", recordBet);
router.post("/win", recordWin);

export default router;
