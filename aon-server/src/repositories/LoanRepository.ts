import { HydratedDocument } from "mongoose";
import Loan, { ILoan } from "../models/Loan.model";

export type LoanDoc = HydratedDocument<ILoan>;

/** Lean shape used when computing leaderboard liabilities. */
export interface ActiveLoanLean {
    userId: { toString(): string };
    amount: number;
    createdAt: Date;
}

/**
 * LoanRepository (Repository pattern)
 *
 * Owns persistence for loans, including the active-loan counting and listing
 * used by the loan limit rule and the leaderboard net-worth calculation.
 */
export interface LoanRepository {
    create(data: Partial<ILoan>): Promise<LoanDoc>;
    save(loan: LoanDoc): Promise<LoanDoc>;
    countActive(userId: string): Promise<number>;
    findActiveByIdForUser(loanId: string, userId: string): Promise<LoanDoc | null>;
    /** Atomically flip an ACTIVE loan to REPAID — null if already repaid (double-fire guard). */
    claimForRepay(loanId: string, userId: string): Promise<LoanDoc | null>;
    findActiveByUser(userId: string): Promise<LoanDoc[]>;
    findAllActive(): Promise<ActiveLoanLean[]>;
}

export class MongoLoanRepository implements LoanRepository {
    create(data: Partial<ILoan>) {
        return Loan.create(data);
    }

    save(loan: LoanDoc) {
        return loan.save();
    }

    countActive(userId: string) {
        return Loan.countDocuments({ userId, status: "ACTIVE" }).exec();
    }

    findActiveByIdForUser(loanId: string, userId: string) {
        return Loan.findOne({ _id: loanId, userId, status: "ACTIVE" }).exec();
    }

    claimForRepay(loanId: string, userId: string) {
        return Loan.findOneAndUpdate(
            { _id: loanId, userId, status: "ACTIVE" },
            { $set: { status: "REPAID", repaidAt: new Date() } },
            { new: true }
        ).exec();
    }

    findActiveByUser(userId: string) {
        return Loan.find({ userId, status: "ACTIVE" }).sort({ createdAt: -1 }).exec();
    }

    findAllActive() {
        return Loan.find({ status: "ACTIVE" }).lean<ActiveLoanLean[]>().exec();
    }
}
