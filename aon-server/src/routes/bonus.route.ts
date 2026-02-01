import { Router } from "express";
import { claimWelcomeBonus, getBonusStatus } from "../controllers/bonus.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All bonus routes are protected
router.use(protect);

router.post("/claim-welcome", claimWelcomeBonus);
router.get("/status", getBonusStatus);

export default router;
