import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import authRoutes from "./routes/auth.route";
import gameRoutes from "./routes/game.route";
import walletRoutes from "./routes/wallet.route";
import transactionRoutes from "./routes/transaction.route";
import leaderboardRoutes from "./routes/leaderboard.route";
import profileRoutes from "./routes/profile.route";
import bonusRoutes from "./routes/bonus.route";
import loanRoutes from "./routes/loan.route";
import { validateOrigin, corsOptions } from "./middlewares/origin.middleware";

const app = express();

// Security middlewares
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json());

// Origin validation - blocks Postman/curl/non-website requests
app.use(validateOrigin);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/bonus", bonusRoutes);
app.use("/api/loan", loanRoutes);

app.get("/health", (_, res) => {
  res.json({ status: "OK" });
});

export default app;
