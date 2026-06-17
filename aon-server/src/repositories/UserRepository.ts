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
export interface UserRepository {
    findById(id: string): Promise<UserDoc | null>;
    findByGoogleId(googleId: string): Promise<UserDoc | null>;
    create(data: Partial<IUser>): Promise<UserDoc>;
    save(user: UserDoc): Promise<UserDoc>;
    findAllForLeaderboard(): Promise<LeaderboardUser[]>;
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
}
