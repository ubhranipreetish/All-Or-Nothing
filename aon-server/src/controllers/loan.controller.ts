import { Request, Response } from "express";
import { container } from "../container";
import { asyncHandler } from "../middlewares/asyncHandler";

/** POST /api/loan/take */
export const takeLoan = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { amount } = req.body as { amount: number };
    const result = await container.loanService.takeLoan(userId, amount);
    res.status(201).json(result);
});

/** POST /api/loan/repay/:loanId */
export const repayLoan = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const loanId = String(req.params.loanId);
    const result = await container.loanService.repayLoan(userId, loanId);
    res.json(result);
});

/** GET /api/loan/active */
export const getActiveLoans = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const result = await container.loanService.getActiveLoans(userId);
    res.json(result);
});
