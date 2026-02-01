import { Router } from "express";
import { getUserTransactions } from "../controllers/transaction.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All transaction routes are protected
router.use(protect);

router.get("/me", getUserTransactions);

export default router;
