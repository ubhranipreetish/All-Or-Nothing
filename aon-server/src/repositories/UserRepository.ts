import { HydratedDocument } from "mongoose";
import User, { IUser } from "../models/User.model";

export type UserDoc = HydratedDocument<IUser>;

/** Lightweight projection used by the leaderboard. */
export interface LeaderboardUser {
    _id: unknown;
    name?: string;
    avatar?: string;
    walletBalance: number;
}

/**
 * UserRepository (Repository pattern)
 *
 * The only module that talks to the User collection. Services depend on this
 * interface rather than Mongoose, which keeps persistence details swappable and
 * the business logic testable (Dependency Inversion).
 */
export interface WalletTotals {
    walletBalance: number;
    totalEarnings: number;
}

export interface UserRepository {
    findById(id: string): Promise<UserDoc | null>;
    findByGoogleId(googleId: string): Promise<UserDoc | null>;
    create(data: Partial<IUser>): Promise<UserDoc>;
    save(user: UserDoc): Promise<UserDoc>;
    findAllForLeaderboard(): Promise<LeaderboardUser[]>;
    /**
     * Atomically add to a user's balance/earnings ($inc). Race-safe for
     * concurrent credits (wins, refunds, loan payout) — no read-modify-write.
     */
    creditWallet(userId: string, balanceDelta: number, earningsDelta: number): Promise<WalletTotals | null>;
    /**
     * Atomically debit, but ONLY if the balance covers `amount`. Returns null if
     * it doesn't — so two concurrent bets can never overdraw the same wallet.
     * `earningsDelta` is subtracted from totalEarnings (defaults to `amount`).
     */
    tryDebit(userId: string, amount: number, earningsDelta?: number): Promise<WalletTotals | null>;
    /** Atomically claim the one-time welcome bonus; null if already claimed. */
    claimWelcomeBonus(userId: string, amount: number): Promise<WalletTotals | null>;
}

export class MongoUserRepository implements UserRepository {
    findById(id: string) {
        return User.findById(id).exec();
    }

    findByGoogleId(googleId: string) {
        return User.findOne({ googleId }).exec();
    }

    create(data: Partial<IUser>) {
        return User.create(data);
    }

    save(user: UserDoc) {
        return user.save();
    }

    findAllForLeaderboard() {
        return User.find({})
            .select("_id name avatar walletBalance")
            .lean<LeaderboardUser[]>()
            .exec();
    }

    async creditWallet(userId: string, balanceDelta: number, earningsDelta: number) {
        const doc = await User.findByIdAndUpdate(
            userId,
            { $inc: { walletBalance: balanceDelta, totalEarnings: earningsDelta } },
            { new: true, projection: { walletBalance: 1, totalEarnings: 1 } }
        ).lean<WalletTotals>();
        return doc ? { walletBalance: doc.walletBalance, totalEarnings: doc.totalEarnings } : null;
    }

    async tryDebit(userId: string, amount: number, earningsDelta?: number) {
        const doc = await User.findOneAndUpdate(
            { _id: userId, walletBalance: { $gte: amount } },
            { $inc: { walletBalance: -amount, totalEarnings: -(earningsDelta ?? amount) } },
            { new: true, projection: { walletBalance: 1, totalEarnings: 1 } }
        ).lean<WalletTotals>();
        return doc ? { walletBalance: doc.walletBalance, totalEarnings: doc.totalEarnings } : null;
    }

    async claimWelcomeBonus(userId: string, amount: number) {
        const doc = await User.findOneAndUpdate(
            { _id: userId, hasClaimed100Bonus: { $ne: true } },
            { $inc: { walletBalance: amount }, $set: { hasClaimed100Bonus: true } },
            { new: true, projection: { walletBalance: 1, totalEarnings: 1 } }
        ).lean<WalletTotals>();
        return doc ? { walletBalance: doc.walletBalance, totalEarnings: doc.totalEarnings } : null;
    }
}
