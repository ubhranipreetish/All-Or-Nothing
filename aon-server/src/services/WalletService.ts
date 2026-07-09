import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";

/**
 * WalletService
 *
 * Read-only wallet queries. There is deliberately no manual deposit/top-up
 * operation — every balance change is server-authoritative and flows through
 * game settlement, loans, or the one-time bonus. A raw "credit my wallet"
 * method would be a mint exploit no matter how well the route was guarded.
 */
export class WalletService {
    constructor(private readonly users: UserRepository) {}

    async getBalance(userId: string) {
        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        return {
            walletBalance: user.walletBalance,
            totalEarnings: user.totalEarnings,
        };
    }
}
