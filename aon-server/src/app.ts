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

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/profile", profileRoutes);

app.get("/health", (_, res) => {
  res.json({ status: "OK" });
});

export default app;
