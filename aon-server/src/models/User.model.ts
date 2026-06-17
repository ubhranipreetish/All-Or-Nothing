import { Schema, model } from "mongoose";

export interface IUser {
  googleId: string;
  email: string;
  name?: string;
  avatar?: string;
  walletBalance: number;
  totalEarnings: number;
  hasClaimed100Bonus: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    name: String,
    avatar: String,
    walletBalance: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    hasClaimed100Bonus: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for leaderboard queries
UserSchema.index({ totalEarnings: -1 });

export default model<IUser>("User", UserSchema);
