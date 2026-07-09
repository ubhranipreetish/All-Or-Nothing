import { Router } from "express";
import { getBalance } from "../controllers/wallet.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All wallet routes are protected.
router.use(protect);

// NOTE: there is no manual "deposit" endpoint. Balance only ever moves through
// game settlement, loans, and the one-time bonus — all server-authoritative.
// A raw "add money to my wallet" route would be an instant mint exploit.
router.get("/balance", getBalance);

export default router;
