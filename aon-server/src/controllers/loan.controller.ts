import { Request, Response } from "express";
import User from "../models/User.model";
import Loan from "../models/Loan.model";
import Transaction from "../models/Transaction.model";
import { emitLeaderboardUpdate, emitTransactionUpdate, emitLoansUpdate, emitWalletUpdate } from "../socket";

const MAX_ACTIVE_LOANS = 2;
const MIN_LOAN_AMOUNT = 1;
const MAX_LOAN_AMOUNT = 10000000;
const DAILY_INTEREST_RATE = 0.10; // 10% per day

/**
 * Calculate compound interest based on days elapsed
 * Day 1 = day of taking loan (immediate 10%)
 * Each midnight adds another compounding day
 */
const calculateRepaymentAmount = (principal: number, loanDate: Date): { amount: number; days: number } => {
    const now = new Date();

    // Get dates at midnight IST for comparison
    const startOfLoanDay = new Date(loanDate);
    startOfLoanDay.setHours(0, 0, 0, 0);

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Days since loan was taken (0 = same day, 1 = next day, etc.)
    const daysDiff = Math.floor((startOfToday.getTime() - startOfLoanDay.getTime()) / (1000 * 60 * 60 * 24));

    // Day 1 starts immediately when loan is taken, so total days = daysDiff + 1
    const totalDays = daysDiff + 1;

    // Compound interest: P * (1 + r)^n
    const repaymentAmount = principal * Math.pow(1 + DAILY_INTEREST_RATE, totalDays);

    return {
        amount: Math.ceil(repaymentAmount * 100) / 100, // Round up to nearest paisa
        days: totalDays,
    };
};

/**
 * Take a loan - Add to wallet, deduct from totalEarnings
 * POST /api/loan/take
 */
export const takeLoan = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { amount } = req.body as { amount: number };

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!amount || amount < MIN_LOAN_AMOUNT || amount > MAX_LOAN_AMOUNT) {
            return res.status(400).json({
                message: `Loan amount must be between ₹${MIN_LOAN_AMOUNT} and ₹${MAX_LOAN_AMOUNT}`
            });
        }

        // Check active loans count
        const activeLoansCount = await Loan.countDocuments({ userId, status: "ACTIVE" });
        if (activeLoansCount >= MAX_ACTIVE_LOANS) {
            return res.status(400).json({
                message: "Loan limit reached. You already have 2 active loans.",
                activeLoans: activeLoansCount,
                maxLoans: MAX_ACTIVE_LOANS,
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Add loan amount to wallet
        const newBalance = user.walletBalance + amount;
        user.walletBalance = newBalance;

        // Deduct from totalEarnings (affects leaderboard)
        user.totalEarnings = user.totalEarnings - amount;
        await user.save();

        // Create loan record
        const loan = await Loan.create({
            userId,
            amount,
            status: "ACTIVE",
        });

        // Calculate initial repayment (with day 1 interest)
        const { amount: repaymentAmount, days } = calculateRepaymentAmount(amount, loan.createdAt);

        // Create transaction record
        await Transaction.create({
            userId,
            type: "DEPOSIT",
            amount: amount,
            balanceAfter: newBalance,
            meta: {
                description: `Loan taken - ₹${amount} (repay ₹${repaymentAmount.toFixed(2)} with 10% daily interest)`,
                bonusType: "LOAN",
            },
        });

        // Emit real-time updates
        emitLeaderboardUpdate();
        emitTransactionUpdate(userId);
        emitLoansUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.status(201).json({
            message: "Loan taken successfully",
            loan: {
                ...loan.toObject(),
                repaymentAmount,
                interestDays: days,
                interestRate: DAILY_INTEREST_RATE * 100,
            },
            newBalance,
            totalEarnings: user.totalEarnings,
            activeLoans: activeLoansCount + 1,
        });
    } catch (error) {
        console.error("Take Loan Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Repay a loan - Deduct repayment amount (with interest) from wallet
 * POST /api/loan/repay/:loanId
 */
export const repayLoan = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { loanId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const loan = await Loan.findOne({ _id: loanId, userId, status: "ACTIVE" });
        if (!loan) {
            return res.status(404).json({ message: "Active loan not found" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Calculate repayment with compound interest
        const { amount: repaymentAmount, days } = calculateRepaymentAmount(loan.amount, loan.createdAt);
        const interestPaid = repaymentAmount - loan.amount;

        // Check if user has enough balance
        if (user.walletBalance < repaymentAmount) {
            return res.status(400).json({
                message: `Insufficient balance. You need ₹${repaymentAmount.toFixed(2)} to repay this loan.`,
                required: repaymentAmount,
                available: user.walletBalance,
                principal: loan.amount,
                interest: interestPaid,
                days,
            });
        }

        // Deduct repayment from wallet
        const newBalance = user.walletBalance - repaymentAmount;
        user.walletBalance = newBalance;

        // Add back only the PRINCIPAL to totalEarnings (interest is profit for the house)
        user.totalEarnings = user.totalEarnings + loan.amount;
        await user.save();

        // Mark loan as repaid
        loan.status = "REPAID";
        loan.repaidAt = new Date();
        await loan.save();

        // Create transaction record
        await Transaction.create({
            userId,
            type: "WITHDRAW",
            amount: -repaymentAmount,
            balanceAfter: newBalance,
            meta: {
                description: `Loan repaid - ₹${loan.amount} principal + ₹${interestPaid.toFixed(2)} interest (${days} days)`,
                bonusType: "LOAN_REPAY",
            },
        });

        const remainingLoans = await Loan.countDocuments({ userId, status: "ACTIVE" });

        // Emit real-time updates
        emitLeaderboardUpdate();
        emitTransactionUpdate(userId);
        emitLoansUpdate(userId);
        emitWalletUpdate(userId, { balance: newBalance, totalEarnings: user.totalEarnings });

        res.json({
            message: "Loan repaid successfully",
            loan,
            principalPaid: loan.amount,
            interestPaid,
            totalPaid: repaymentAmount,
            days,
            newBalance,
            totalEarnings: user.totalEarnings,
            activeLoans: remainingLoans,
        });
    } catch (error) {
        console.error("Repay Loan Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Get active loans for user with current repayment amounts
 * GET /api/loan/active
 */
export const getActiveLoans = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const loans = await Loan.find({ userId, status: "ACTIVE" }).sort({ createdAt: -1 });

        // Add repayment amounts with interest to each loan
        const loansWithInterest = loans.map((loan) => {
            const { amount: repaymentAmount, days } = calculateRepaymentAmount(loan.amount, loan.createdAt);
            return {
                ...loan.toObject(),
                repaymentAmount,
                interestDays: days,
                interestRate: DAILY_INTEREST_RATE * 100,
            };
        });

        res.json({
            loans: loansWithInterest,
            count: loans.length,
            maxLoans: MAX_ACTIVE_LOANS,
            canTakeLoan: loans.length < MAX_ACTIVE_LOANS,
            interestRate: DAILY_INTEREST_RATE * 100,
        });
    } catch (error) {
        console.error("Get Active Loans Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
