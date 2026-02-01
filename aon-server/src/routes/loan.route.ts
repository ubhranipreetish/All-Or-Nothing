import { Router } from "express";
import { takeLoan, repayLoan, getActiveLoans } from "../controllers/loan.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// All loan routes are protected
router.use(protect);

router.post("/take", takeLoan);
router.post("/repay/:loanId", repayLoan);
router.get("/active", getActiveLoans);

export default router;
