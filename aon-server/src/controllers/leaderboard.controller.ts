import { Request, Response } from "express";
import User from "../models/User.model";

/**
 * Get all-time leaderboard sorted by total earnings
 * GET /api/leaderboard/all-time
 */
export const getAllTimeLeaderboard = async (_req: Request, res: Response) => {
    try {
        const leaderboard = await User.find({})
            .sort({ totalEarnings: -1 })
            .limit(50)
            .select("name avatar totalEarnings")
            .lean();

        // Add rank to each user
        const rankedLeaderboard = leaderboard.map((user, index) => ({
            rank: index + 1,
            userId: user._id,
            username: user.name,
            avatar: user.avatar,
            totalEarnings: user.totalEarnings,
        }));

        res.json({
            leaderboard: rankedLeaderboard,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Leaderboard Error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};
