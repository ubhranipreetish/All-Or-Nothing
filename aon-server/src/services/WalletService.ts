import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";
import { PositiveNumberValidator } from "../shared/validation/Validator";

/**
 * WalletService
 *
 * Direct wallet operations (deposit, balance read). Game payouts and loans flow
 * through their own services; this one only covers manual top-ups and queries.
 */
export class WalletService {
    constructor(
        private readonly users: UserRepository,
        private readonly transactions: TransactionRepository
    ) {}

    async deposit(userId: string, amount: number) {
        const error = new PositiveNumberValidator(amount, "Invalid deposit amount").validate();
        if (error) throw AppError.badRequest(error);

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const newBalance = user.walletBalance + amount;
        user.walletBalance = newBalance;
        await this.users.save(user);

        const transaction = await this.transactions.create({
            userId: user._id,
            type: "DEPOSIT",
            amount,
            balanceAfter: newBalance,
        });

        return { message: "Deposit successful", transaction, newBalance };
    }

    async getBalance(userId: string) {
        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        return {
            walletBalance: user.walletBalance,
            totalEarnings: user.totalEarnings,
        };
    }
}
