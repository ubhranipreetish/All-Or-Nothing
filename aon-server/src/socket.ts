import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import User from "./models/User.model";
import Loan from "./models/Loan.model";

export type { Server as SocketServer };

let io: Server | null = null;

const DAILY_INTEREST_RATE = 0.10;

/**
 * Calculate compound interest for a loan
 */
const calculateRepaymentAmount = (principal: number, loanDate: Date): number => {
    const now = new Date();

    const startOfLoanDay = new Date(loanDate);
    startOfLoanDay.setHours(0, 0, 0, 0);

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((startOfToday.getTime() - startOfLoanDay.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = daysDiff + 1;

    return principal * Math.pow(1 + DAILY_INTEREST_RATE, totalDays);
};

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket: Socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Join user's personal room for user-specific updates
        socket.on("join-user-room", (userId: string) => {
            socket.join(`user:${userId}`);
            console.log(`Socket ${socket.id} joined room user:${userId}`);
        });

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.IO not initialized");
    }
    return io;
};

/**
 * Emit leaderboard update to all connected clients
 */
export const emitLeaderboardUpdate = async (): Promise<void> => {
    if (!io) return;

    try {
        // Get all users
        const users = await User.find({})
            .select("_id name avatar walletBalance")
            .lean();

        // Get all active loans
        const activeLoans = await Loan.find({ status: "ACTIVE" }).lean();

        // Create a map of userId -> total repayment amount
        const userLoanMap = new Map<string, number>();
        for (const loan of activeLoans) {
            const userId = loan.userId.toString();
            const repayAmount = calculateRepaymentAmount(loan.amount, loan.createdAt);
            userLoanMap.set(userId, (userLoanMap.get(userId) || 0) + repayAmount);
        }

        // Calculate net worth for each user
        const usersWithNetWorth = users.map((user) => {
            const loansToRepay = userLoanMap.get(user._id.toString()) || 0;
            const netWorth = user.walletBalance - loansToRepay;
            return {
                userId: user._id,
                username: user.name,
                avatar: user.avatar,
                walletBalance: user.walletBalance,
                loansToRepay,
                netWorth,
            };
        });

        // Sort by net worth descending
        usersWithNetWorth.sort((a, b) => b.netWorth - a.netWorth);

        // Take top 50 and add ranks
        const rankedLeaderboard = usersWithNetWorth.slice(0, 50).map((user, index) => ({
            rank: index + 1,
            ...user,
        }));

        io.emit("leaderboard-update", {
            leaderboard: rankedLeaderboard,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error emitting leaderboard update:", error);
    }
};

/**
 * Emit transaction update to a specific user
 */
export const emitTransactionUpdate = (userId: string): void => {
    if (!io) return;
    io.to(`user:${userId}`).emit("transactions-update");
};

/**
 * Emit wallet update to a specific user
 */
export const emitWalletUpdate = (userId: string, walletData: { balance: number; totalEarnings: number }): void => {
    if (!io) return;
    io.to(`user:${userId}`).emit("wallet-update", walletData);
};

/**
 * Emit loans update to a specific user
 */
export const emitLoansUpdate = (userId: string): void => {
    if (!io) return;
    io.to(`user:${userId}`).emit("loans-update");
};
