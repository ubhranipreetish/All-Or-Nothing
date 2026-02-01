import { Request, Response } from "express";
import User from "../models/User.model";
import Loan from "../models/Loan.model";

const DAILY_INTEREST_RATE = 0.10;

/**
 * Calculate compound interest for a loan
 */
const calculateRepaymentAmount = (principal: number, loanDate: Date): number => {
    const now = new Date();

    const startOfLoanDay = new Date(loanDate);
    startOfLoanDay.setHours(0, 0, 0, 0);

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((startOfToday.getTime() - startOfLoanDay.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = daysDiff + 1;

    return principal * Math.pow(1 + DAILY_INTEREST_RATE, totalDays);
};

/**
 * Get all-time leaderboard sorted by net worth (balance - loans to repay)
 * GET /api/leaderboard/all-time
 */
export const getAllTimeLeaderboard = async (_req: Request, res: Response) => {
    try {
        // Get all users
        const users = await User.find({})
            .select("_id name avatar walletBalance")
            .lean();

        // Get all active loans
        const activeLoans = await Loan.find({ status: "ACTIVE" }).lean();

        // Create a map of userId -> total repayment amount
        const userLoanMap = new Map<string, number>();
        for (const loan of activeLoans) {
            const userId = loan.userId.toString();
            const repayAmount = calculateRepaymentAmount(loan.amount, loan.createdAt);
            userLoanMap.set(userId, (userLoanMap.get(userId) || 0) + repayAmount);
        }

        // Calculate net worth for each user
        const usersWithNetWorth = users.map((user) => {
            const loansToRepay = userLoanMap.get(user._id.toString()) || 0;
            const netWorth = user.walletBalance - loansToRepay;
            return {
                userId: user._id,
                username: user.name,
                avatar: user.avatar,
                walletBalance: user.walletBalance,
                loansToRepay,
                netWorth,
            };
        });

        // Sort by net worth descending
        usersWithNetWorth.sort((a, b) => b.netWorth - a.netWorth);

        // Take top 50 and add ranks
        const rankedLeaderboard = usersWithNetWorth.slice(0, 50).map((user, index) => ({
            rank: index + 1,
            ...user,
        }));

        res.json({
            leaderboard: rankedLeaderboard,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Leaderboard Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
