import { Router } from "express";
import {
    startGame,
    revealMines,
    revealDragon,
    spinWheel,
    spinRoulette,
    cashOut,
    pokerBuyIn,
    pokerSettle,
    refund,
    loseGame,
    getActiveSession,
} from "../controllers/game.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All game routes are protected.
router.use(protect);

router.get("/active", getActiveSession);
router.post("/start", startGame);

// Server-authoritative play. The client only names its choice; the server owns
// the board/number and computes every payout. There is intentionally NO endpoint
// that accepts a client-supplied win amount or multiplier.
router.post("/mines/reveal", revealMines);
router.post("/dragon/reveal", revealDragon);
router.post("/wheel/spin", spinWheel);
router.post("/roulette/spin", spinRoulette);
router.post("/cashout", cashOut);

// Poker money moves ONLY over these authenticated HTTP endpoints. buyin debits
// the user's own money and issues a secret seatToken; settle credits the
// SERVER's authoritative final stack (recorded by the socket layer) — never a
// client-supplied amount. The socket path never mutates a wallet.
router.post("/poker/buyin", pokerBuyIn);
router.post("/poker/settle", pokerSettle);

router.post("/refund", refund);
router.post("/lose", loseGame);

export default router;
