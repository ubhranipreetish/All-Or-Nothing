import { InterestCalculator } from "../domain/loans/InterestCalculator";
import { LoanRepository } from "../repositories/LoanRepository";
import { UserRepository } from "../repositories/UserRepository";
import { cache } from "../config/cache";

const LEADERBOARD_CACHE_KEY = "leaderboard:all-time";
const LEADERBOARD_TTL_SECONDS = 15;

export interface LeaderboardEntry {
    rank: number;
    userId: unknown;
    username?: string;
    avatar?: string;
    walletBalance: number;
    loansToRepay: number;
    netWorth: number;
}

export interface LeaderboardResult {
    leaderboard: LeaderboardEntry[];
    updatedAt: string;
}

/**
 * LeaderboardService
 *
 * Single source of truth for the all-time leaderboard. Previously this exact
 * computation was duplicated in both the leaderboard controller and the socket
 * module; now the HTTP endpoint and the realtime notifier both call this.
 *
 * Net worth = wallet balance - outstanding loan liabilities (principal +
 * compounded interest, unrounded).
 */
export class LeaderboardService {
    constructor(
        private readonly users: UserRepository,
        private readonly loans: LoanRepository,
        private readonly interest: InterestCalculator
    ) {}

    /** Drop the cached board so the next read recomputes (called on any change). */
    async invalidate(): Promise<void> {
        await cache.del(LEADERBOARD_CACHE_KEY);
    }

    async getLeaderboard(): Promise<LeaderboardResult> {
        // The board is a full user + active-loan scan; cache it briefly so a burst
        // of viewers (or the socket re-broadcast) doesn't re-scan on every hit.
        // Every win/loan invalidates it, so it's fresh in practice and the TTL
        // only bounds the worst case.
        const cached = await cache.get<LeaderboardResult>(LEADERBOARD_CACHE_KEY);
        if (cached) return cached;

        const result = await this.computeLeaderboard();
        await cache.set(LEADERBOARD_CACHE_KEY, result, LEADERBOARD_TTL_SECONDS);
        return result;
    }

    private async computeLeaderboard(): Promise<LeaderboardResult> {
        const users = await this.users.findAllForLeaderboard();
        const activeLoans = await this.loans.findAllActive();

        // userId -> total outstanding repayment (raw, unrounded)
        const userLoanMap = new Map<string, number>();
        for (const loan of activeLoans) {
            const userId = loan.userId.toString();
            const repayAmount = this.interest.computeRaw(loan.amount, loan.createdAt).amount;
            userLoanMap.set(userId, (userLoanMap.get(userId) || 0) + repayAmount);
        }

        const usersWithNetWorth = users.map((user) => {
            const loansToRepay = userLoanMap.get(String(user._id)) || 0;
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

        usersWithNetWorth.sort((a, b) => b.netWorth - a.netWorth);

        const leaderboard = usersWithNetWorth.slice(0, 50).map((user, index) => ({
            rank: index + 1,
            ...user,
        }));

        return { leaderboard, updatedAt: new Date().toISOString() };
    }
}
