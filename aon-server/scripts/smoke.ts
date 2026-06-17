/**
 * Behavior-parity smoke test.
 *
 * Boots the REAL Express app against an in-memory MongoDB and exercises the
 * full API surface, asserting the same status codes / response shapes the
 * original implementation produced.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

async function main() {
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // Must be set BEFORE importing config/env (its Singleton reads env once).
    process.env.MONGO_URI = uri;
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN = "7d";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.PORT = "5055";

    const { database } = await import("../src/config/database");
    const appModule = await import("../src/app");
    const UserModule = await import("../src/models/User.model");
    const app = appModule.default;
    const User = UserModule.default;

    await database.connect();

    const user = await User.create({
        googleId: "g-1",
        email: "player@test.com",
        name: "Player One",
        avatar: "http://x/y.png",
        walletBalance: 1000,
        totalEarnings: 0,
    });
    const token = jwt.sign({ userId: String(user._id) }, "test-secret", { expiresIn: "7d" });

    const server = app.listen(5055);
    const base = "http://localhost:5055";

    let pass = 0;
    let fail = 0;
    const check = (name: string, cond: boolean, extra?: unknown) => {
        if (cond) {
            pass++;
            console.log(`  PASS  ${name}`);
        } else {
            fail++;
            console.log(`  FAIL  ${name}`, extra ?? "");
        }
    };

    const call = async (
        method: string,
        path: string,
        opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
    ) => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
            ...(opts.headers ?? {}),
        };
        if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
        const res = await fetch(`${base}${path}`, {
            method,
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        let json: any = null;
        try {
            json = await res.json();
        } catch {
            /* no body */
        }
        return { status: res.status, json };
    };

    try {
        // Health
        let r = await call("GET", "/health");
        check("health 200", r.status === 200 && r.json.status === "OK", r);

        // Auth guard
        r = await call("GET", "/api/profile/me");
        check("profile no-token 401", r.status === 401 && r.json.message === "Unauthorized", r);

        // Profile
        r = await call("GET", "/api/profile/me", { token });
        check(
            "profile 200 shape",
            r.status === 200 && r.json.user.email === "player@test.com" && r.json.wallet.balance === 1000,
            r
        );

        // Public leaderboard
        r = await call("GET", "/api/leaderboard/all-time");
        check(
            "leaderboard 200 netWorth",
            r.status === 200 &&
                Array.isArray(r.json.leaderboard) &&
                r.json.leaderboard[0].netWorth === 1000 &&
                r.json.leaderboard[0].rank === 1,
            r
        );

        // Bonus claim + idempotency
        r = await call("POST", "/api/bonus/claim-welcome", { token });
        check("bonus claim 201", r.status === 201 && r.json.bonus === 100 && r.json.newBalance === 1100, r);
        r = await call("POST", "/api/bonus/claim-welcome", { token });
        check("bonus reclaim 400", r.status === 400 && r.json.alreadyClaimed === true, r);

        // Wallet deposit + validation
        r = await call("POST", "/api/wallet/deposit", { token, body: { amount: 400 } });
        check("deposit 201", r.status === 201 && r.json.newBalance === 1500, r);
        r = await call("POST", "/api/wallet/deposit", { token, body: { amount: -5 } });
        check("deposit invalid 400", r.status === 400 && r.json.message === "Invalid deposit amount", r);

        // Game lifecycle
        r = await call("POST", "/api/game/start", { token, body: { amount: 100, gameType: "MINES" } });
        const sessionId = r.json.sessionId;
        check("game start 201", r.status === 201 && r.json.newBalance === 1400 && !!sessionId, r);

        r = await call("POST", "/api/game/start", { token, body: { amount: 0, gameType: "MINES" } });
        check("game start invalid amount 400", r.status === 400 && r.json.message === "Invalid bet amount", r);

        r = await call("POST", "/api/game/start", { token, body: { amount: 50, gameType: "MINES" } });
        check("game duplicate session 400", r.status === 400 && !!r.json.sessionId, r);

        r = await call("POST", "/api/game/update-multiplier", { token, body: { sessionId, multiplier: 2 } });
        check("update-multiplier 200", r.status === 200 && r.json.potentialWin === 200, r);

        r = await call("POST", "/api/game/cashout", { token, body: { sessionId } });
        check("cashout 200", r.status === 200 && r.json.winAmount === 200 && r.json.newBalance === 1600, r);

        r = await call("GET", "/api/game/active?gameType=MINES", { token });
        check("active session false", r.status === 200 && r.json.active === false, r);

        // Loan take / list / repay (10% daily, same-day => 1.1x)
        r = await call("POST", "/api/loan/take", { token, body: { amount: 1000 } });
        const loanId = r.json.loan?._id;
        check(
            "loan take 201",
            r.status === 201 && r.json.loan.repaymentAmount === 1100 && r.json.loan.interestRate === 10,
            r
        );
        r = await call("GET", "/api/loan/active", { token });
        check("loan active count 1", r.status === 200 && r.json.count === 1 && r.json.canTakeLoan === true, r);
        r = await call("POST", `/api/loan/repay/${loanId}`, { token });
        check(
            "loan repay 200",
            r.status === 200 && r.json.totalPaid === 1100 && r.json.interestPaid === 100,
            r
        );

        // Transactions ledger
        r = await call("GET", "/api/transactions/me?limit=5", { token });
        check(
            "transactions paginated",
            r.status === 200 && Array.isArray(r.json.transactions) && r.json.pagination.limit === 5,
            r
        );

        // Origin / tooling block
        r = await call("GET", "/api/leaderboard/all-time", { headers: { "User-Agent": "curl/8.0", Origin: "" } });
        check("curl user-agent blocked 403", r.status === 403, r);
    } finally {
        server.close();
        const mongoose = (await import("mongoose")).default;
        await mongoose.disconnect();
        await mongod.stop();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
