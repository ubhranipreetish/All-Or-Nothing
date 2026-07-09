import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit, { Options as RateLimitOptions } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "./config/cache";
import authRoutes from "./routes/auth.route";
import gameRoutes from "./routes/game.route";
import walletRoutes from "./routes/wallet.route";
import transactionRoutes from "./routes/transaction.route";
import leaderboardRoutes from "./routes/leaderboard.route";
import profileRoutes from "./routes/profile.route";
import bonusRoutes from "./routes/bonus.route";
import loanRoutes from "./routes/loan.route";
import { validateOrigin, corsOptions } from "./middlewares/origin.middleware";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// Render (and most PaaS) put the app behind a reverse proxy, so the real client
// IP is in X-Forwarded-For. Trust one proxy hop so the rate limiter keys on the
// actual client, not the proxy.
app.set("trust proxy", 1);

// Security middlewares
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json());

// Origin validation — a defence-in-depth speed bump against casual tooling.
// NOTE: this is NOT a security boundary. Origin/Referer/User-Agent headers are
// all attacker-controlled and trivially spoofed (Postman, curl -H, fetch). The
// real protection is that every money mutation is server-authoritative; nothing
// below trusts a client-supplied amount, multiplier, or board. See SECURITY.md.
app.use(validateOrigin);

// Rate limiting. Rides in front of the money routes so a leaked token can't be
// used to hammer bet/reveal/spin/loan endpoints (brute-forcing favourable RNG,
// or just abuse). Trust proxy is enabled in server.ts for correct client IPs.
// Use a shared Redis store for counters when REDIS_URL is set (correct across
// multiple instances); otherwise the default in-memory store (fine for one).
const limiterStore = (prefix: string): Partial<RateLimitOptions> => {
    const client = getRedisClient();
    if (!client) return {};
    return {
        store: new RedisStore({
            prefix,
            sendCommand: (...args: string[]): Promise<any> => (client.call as any)(...args),
        }),
    };
};

const moneyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120, // ~2 money actions/sec/IP sustained — generous for real play, hostile to scripts
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests — slow down." },
    ...limiterStore("rl:money:"),
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts — try again later." },
    ...limiterStore("rl:auth:"),
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/game", moneyLimiter, gameRoutes);
app.use("/api/wallet", moneyLimiter, walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/bonus", moneyLimiter, bonusRoutes);
app.use("/api/loan", moneyLimiter, loanRoutes);

// Health/warmup — used by uptime monitors and by the frontend's first-visit
// ping that wakes the Render free-tier dyno before the player's first bet.
const health = (_: express.Request, res: express.Response) => {
  res.json({ status: "OK", uptime: process.uptime() });
};
app.get("/health", health);
app.get("/warmup", health);
app.get("/api/health", health);
app.get("/api/warmup", health);

// Central error handler — must be registered last.
app.use(errorHandler);

export default app;
