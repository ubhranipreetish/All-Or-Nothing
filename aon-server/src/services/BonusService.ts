import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";

const WELCOME_BONUS_AMOUNT = 100;

/**
 * BonusService
 *
 * Promotional credits. Today that's a one-time ₹100 welcome bonus; new bonus
 * types slot in here without touching wallet or game logic.
 */
export class BonusService {
    constructor(
        private readonly users: UserRepository,
        private readonly transactions: TransactionRepository
    ) {}

    async claimWelcomeBonus(userId: string) {
        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        if (user.hasClaimed100Bonus) {
            throw AppError.badRequest("Welcome bonus already claimed", { alreadyClaimed: true });
        }

        const newBalance = user.walletBalance + WELCOME_BONUS_AMOUNT;
        user.walletBalance = newBalance;
        user.hasClaimed100Bonus = true;
        await this.users.save(user);

        const transaction = await this.transactions.create({
            userId: user._id,
            type: "DEPOSIT",
            amount: WELCOME_BONUS_AMOUNT,
            balanceAfter: newBalance,
            meta: {
                bonusType: "WELCOME_100",
                description: "Welcome bonus - ₹100 free credits",
            },
        });

        return {
            message: "Welcome bonus claimed successfully!",
            bonus: WELCOME_BONUS_AMOUNT,
            newBalance,
            transaction,
        };
    }

    async getStatus(userId: string) {
        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        return { hasClaimed100Bonus: user.hasClaimed100Bonus };
    }
}
