import { Schema, model } from "mongoose";

const UserSchema = new Schema(
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

export default model("User", UserSchema);
