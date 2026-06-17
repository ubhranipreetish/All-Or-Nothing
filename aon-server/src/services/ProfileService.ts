import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";

/**
 * ProfileService
 *
 * Read model for the profile screen: the user's basics, wallet summary, and a
 * headline "biggest win" pulled from the transaction ledger.
 */
export class ProfileService {
    constructor(
        private readonly users: UserRepository,
        private readonly transactions: TransactionRepository
    ) {}

    async getProfile(userId: string) {
        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const biggestWin = await this.transactions.findBiggestWin(userId);

        return {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                createdAt: user.createdAt,
            },
            wallet: {
                balance: user.walletBalance,
                totalEarnings: user.totalEarnings,
            },
            biggestWin: biggestWin
                ? {
                      amount: biggestWin.amount,
                      gameType: biggestWin.gameType,
                      date: biggestWin.createdAt,
                      multiplier: biggestWin.meta?.multiplier,
                  }
                : null,
        };
    }
}
