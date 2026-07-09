import { Types } from "mongoose";
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
        // Atomic claim: the flag flips and the credit lands in one operation, so
        // two concurrent claims can't both pass the "already claimed?" check.
        const totals = await this.users.claimWelcomeBonus(userId, WELCOME_BONUS_AMOUNT);
        if (!totals) {
            const exists = await this.users.findById(userId);
            if (!exists) throw AppError.notFound("User not found");
            throw AppError.badRequest("Welcome bonus already claimed", { alreadyClaimed: true });
        }

        const newBalance = totals.walletBalance;

        const transaction = await this.transactions.create({
            userId: new Types.ObjectId(userId),
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
