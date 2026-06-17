import { InterestCalculator } from "../domain/loans/InterestCalculator";
import { LoanRepository } from "../repositories/LoanRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";
import { DomainEvent } from "../shared/events/DomainEvents";
import { eventBus } from "../shared/events/EventBus";

const MAX_ACTIVE_LOANS = 2;
const MIN_LOAN_AMOUNT = 1;
const MAX_LOAN_AMOUNT = 10000000;

/**
 * LoanService
 *
 * Lets a player borrow against their future earnings and repay with compounding
 * daily interest. The interest formula is delegated to an {@link InterestCalculator}
 * (Strategy), and balance/leaderboard side effects are emitted as domain events.
 */
export class LoanService {
    constructor(
        private readonly users: UserRepository,
        private readonly loans: LoanRepository,
        private readonly transactions: TransactionRepository,
        private readonly interest: InterestCalculator
    ) {}

    async takeLoan(userId: string, amount: number) {
        if (!amount || amount < MIN_LOAN_AMOUNT || amount > MAX_LOAN_AMOUNT) {
            throw AppError.badRequest(
                `Loan amount must be between ₹${MIN_LOAN_AMOUNT} and ₹${MAX_LOAN_AMOUNT}`
            );
        }

        const activeLoansCount = await this.loans.countActive(userId);
        if (activeLoansCount >= MAX_ACTIVE_LOANS) {
            throw AppError.badRequest("Loan limit reached. You already have 2 active loans.", {
                activeLoans: activeLoansCount,
                maxLoans: MAX_ACTIVE_LOANS,
            });
        }

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const newBalance = user.walletBalance + amount;
        user.walletBalance = newBalance;
        // Borrowing reduces net worth on the leaderboard until it's repaid.
        user.totalEarnings = user.totalEarnings - amount;
        await this.users.save(user);

        const loan = await this.loans.create({ userId: user._id, amount, status: "ACTIVE" });

        const { amount: repaymentAmount, days } = this.interest.compute(amount, loan.createdAt);

        await this.transactions.create({
            userId: user._id,
            type: "DEPOSIT",
            amount,
            balanceAfter: newBalance,
            meta: {
                description: `Loan taken - ₹${amount} (repay ₹${repaymentAmount.toFixed(
                    2
                )} with 10% daily interest)`,
                bonusType: "LOAN",
            },
        });

        eventBus.publish(DomainEvent.LeaderboardChanged, {});
        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.LoansUpdated, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Loan taken successfully",
            loan: {
                ...loan.toObject(),
                repaymentAmount,
                interestDays: days,
                interestRate: this.interest.ratePercent,
            },
            newBalance,
            totalEarnings: user.totalEarnings,
            activeLoans: activeLoansCount + 1,
        };
    }

    async repayLoan(userId: string, loanId: string) {
        const loan = await this.loans.findActiveByIdForUser(loanId, userId);
        if (!loan) throw AppError.notFound("Active loan not found");

        const user = await this.users.findById(userId);
        if (!user) throw AppError.notFound("User not found");

        const { amount: repaymentAmount, days } = this.interest.compute(loan.amount, loan.createdAt);
        const interestPaid = repaymentAmount - loan.amount;

        if (user.walletBalance < repaymentAmount) {
            throw AppError.badRequest(
                `Insufficient balance. You need ₹${repaymentAmount.toFixed(2)} to repay this loan.`,
                {
                    required: repaymentAmount,
                    available: user.walletBalance,
                    principal: loan.amount,
                    interest: interestPaid,
                    days,
                }
            );
        }

        const newBalance = user.walletBalance - repaymentAmount;
        user.walletBalance = newBalance;
        // Only the principal is restored to net worth — interest is the house's cut.
        user.totalEarnings = user.totalEarnings + loan.amount;
        await this.users.save(user);

        loan.status = "REPAID";
        loan.repaidAt = new Date();
        await this.loans.save(loan);

        await this.transactions.create({
            userId: user._id,
            type: "WITHDRAW",
            amount: -repaymentAmount,
            balanceAfter: newBalance,
            meta: {
                description: `Loan repaid - ₹${loan.amount} principal + ₹${interestPaid.toFixed(
                    2
                )} interest (${days} days)`,
                bonusType: "LOAN_REPAY",
            },
        });

        const remainingLoans = await this.loans.countActive(userId);

        eventBus.publish(DomainEvent.LeaderboardChanged, {});
        eventBus.publish(DomainEvent.TransactionRecorded, { userId });
        eventBus.publish(DomainEvent.LoansUpdated, { userId });
        eventBus.publish(DomainEvent.WalletUpdated, {
            userId,
            balance: newBalance,
            totalEarnings: user.totalEarnings,
        });

        return {
            message: "Loan repaid successfully",
            loan,
            principalPaid: loan.amount,
            interestPaid,
            totalPaid: repaymentAmount,
            days,
            newBalance,
            totalEarnings: user.totalEarnings,
            activeLoans: remainingLoans,
        };
    }

    async getActiveLoans(userId: string) {
        const loans = await this.loans.findActiveByUser(userId);

        const loansWithInterest = loans.map((loan) => {
            const { amount: repaymentAmount, days } = this.interest.compute(
                loan.amount,
                loan.createdAt
            );
            return {
                ...loan.toObject(),
                repaymentAmount,
                interestDays: days,
                interestRate: this.interest.ratePercent,
            };
        });

        return {
            loans: loansWithInterest,
            count: loans.length,
            maxLoans: MAX_ACTIVE_LOANS,
            canTakeLoan: loans.length < MAX_ACTIVE_LOANS,
            interestRate: this.interest.ratePercent,
        };
    }
}
