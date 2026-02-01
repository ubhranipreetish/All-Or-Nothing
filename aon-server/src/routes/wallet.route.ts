import { Router } from "express";
import { deposit, getBalance } from "../controllers/wallet.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All wallet routes are protected
router.use(protect);

router.post("/deposit", deposit);
router.get("/balance", getBalance);

export default router;
