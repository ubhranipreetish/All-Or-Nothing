import { Router } from "express";
import { getAllTimeLeaderboard } from "../controllers/leaderboard.controller";

const router = Router();

// Leaderboard is public - no auth required
router.get("/all-time", getAllTimeLeaderboard);

export default router;
