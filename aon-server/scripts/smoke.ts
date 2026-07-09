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
    const GameSessionModule = await import("../src/models/GameSession.model");
    const app = appModule.default;
    const User = UserModule.default;
    const GameSession = GameSessionModule.default;

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

        // Balance after bonus is 1100.
        const balAfterBonus = 1100;

        // ============================================================
        // SECURITY: the pure-mint endpoints must be GONE (404), not merely
        // guarded. These are the exact routes an attacker with a stolen token
        // would hit from Postman.
        // ============================================================
        r = await call("POST", "/api/wallet/deposit", { token, body: { amount: 999999 } });
        check("wallet deposit endpoint removed (404)", r.status === 404, r);

        r = await call("POST", "/api/game/win", {
            token,
            body: { winAmount: 999999, betAmount: 1, gameType: "MINES" },
        });
        check("forged /game/win endpoint removed (404)", r.status === 404, r);

        r = await call("POST", "/api/game/bet", { token, body: { amount: 100, gameType: "MINES" } });
        check("legacy /game/bet endpoint removed (404)", r.status === 404, r);

        r = await call("POST", "/api/game/update-multiplier", { token, body: { sessionId: "x", multiplier: 1000 } });
        check("update-multiplier endpoint removed (404)", r.status === 404, r);

        // ============================================================
        // MINES — server-authoritative board + multiplier.
        // ============================================================
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 100, gameType: "MINES", gameConfig: { mineCount: 3 } },
        });
        const minesSession = r.json.sessionId;
        check(
            "mines start 201 (stake deducted)",
            r.status === 201 && r.json.newBalance === balAfterBonus - 100 && !!minesSession,
            r
        );

        // The board is secret: /game/active must never leak mine positions.
        r = await call("GET", "/api/game/active?gameType=MINES", { token });
        check(
            "active session hides the board",
            r.status === 200 &&
                r.json.active === true &&
                r.json.gameConfig?.mineCount === 3 &&
                r.json.gameConfig?.mines === undefined &&
                r.json.outcome === undefined,
            r
        );

        // Cash out before any reveal must be rejected (no phantom win).
        r = await call("POST", "/api/game/cashout", { token, body: { sessionId: minesSession } });
        check("mines cashout at 0 reveals 400", r.status === 400, r);

        // Read the SERVER's planted board straight from the DB to drive the test.
        const sessDoc: any = await GameSession.findById(minesSession).select("+outcome").lean();
        const mines: number[] = sessDoc.outcome.mines;
        const safeTiles = Array.from({ length: 25 }, (_, i) => i).filter((i) => !mines.includes(i));

        r = await call("POST", "/api/game/mines/reveal", {
            token,
            body: { sessionId: minesSession, tileIndex: safeTiles[0] },
        });
        check("mines reveal safe 200 (mult > 1)", r.status === 200 && r.json.hit === false && r.json.multiplier > 1, r);
        const multAfter1 = r.json.multiplier;

        r = await call("POST", "/api/game/mines/reveal", {
            token,
            body: { sessionId: minesSession, tileIndex: safeTiles[1] },
        });
        check("mines second safe raises multiplier", r.status === 200 && r.json.multiplier > multAfter1, r);
        const finalMult = r.json.multiplier;

        r = await call("POST", "/api/game/cashout", { token, body: { sessionId: minesSession } });
        check(
            "mines cashout pays SERVER multiplier only",
            r.status === 200 && Math.abs(r.json.winAmount - 100 * finalMult) < 0.02,
            r
        );

        // A fresh session, then hit a real mine → server settles the loss.
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 50, gameType: "MINES", gameConfig: { mineCount: 5 } },
        });
        const loseSession = r.json.sessionId;
        const loseDoc: any = await GameSession.findById(loseSession).select("+outcome").lean();
        r = await call("POST", "/api/game/mines/reveal", {
            token,
            body: { sessionId: loseSession, tileIndex: loseDoc.outcome.mines[0] },
        });
        check("mines reveal a mine → hit + loss", r.status === 200 && r.json.hit === true, r);
        r = await call("POST", "/api/game/cashout", { token, body: { sessionId: loseSession } });
        check("cashout on a lost session 404", r.status === 404, r);

        // ============================================================
        // DRAGON TOWER — server-authoritative rows.
        // ============================================================
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 40, gameType: "DRAGON_TOWER", gameConfig: { difficulty: "Low" } },
        });
        const dtSession = r.json.sessionId;
        const dtDoc: any = await GameSession.findById(dtSession).select("+outcome").lean();
        const dragons: number[] = dtDoc.outcome.dragons;
        const safeFloor0 = [0, 1, 2, 3].find((i) => i !== dragons[0])!;
        r = await call("POST", "/api/game/dragon/reveal", {
            token,
            body: { sessionId: dtSession, tileIndex: safeFloor0 },
        });
        check(
            "dragon safe climb → floor 1, mult 1.4",
            r.status === 200 && r.json.hit === false && r.json.floor === 1 && Math.abs(r.json.multiplier - 1.4) < 0.001,
            r
        );
        r = await call("POST", "/api/game/dragon/reveal", {
            token,
            body: { sessionId: dtSession, tileIndex: dragons[1] },
        });
        check("dragon hit → loss", r.status === 200 && r.json.hit === true, r);

        // ============================================================
        // WHEEL — server picks the segment and settles in one call.
        // ============================================================
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 20, gameType: "WHEEL", gameConfig: { risk: "medium", segments: 20 } },
        });
        const wheelSession = r.json.sessionId;
        r = await call("POST", "/api/game/wheel/spin", { token, body: { sessionId: wheelSession } });
        check(
            "wheel spin returns server multiplier + payout",
            r.status === 200 &&
                typeof r.json.multiplier === "number" &&
                Math.abs(r.json.payout - 20 * r.json.multiplier) < 0.02,
            r
        );

        // ============================================================
        // ROULETTE — server picks the number and prices the bets by KEY.
        // ============================================================
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 50, gameType: "ROULETTE" },
        });
        const rlSession = r.json.sessionId;
        // Forged bet: claim to have staked far more than was deducted → rejected.
        r = await call("POST", "/api/game/roulette/spin", {
            token,
            body: { sessionId: rlSession, bets: [{ key: "red", amount: 500000 }] },
        });
        check("roulette forged stake rejected 400", r.status === 400, r);
        // Malformed bet key → rejected.
        r = await call("POST", "/api/game/roulette/spin", {
            token,
            body: { sessionId: rlSession, bets: [{ key: "i0-1-2-3-4-5-6-7", amount: 50 }] },
        });
        check("roulette malformed bet rejected 400", r.status === 400, r);
        // Legit spin: stake matches, server picks the number and prices RED itself.
        r = await call("POST", "/api/game/roulette/spin", {
            token,
            body: { sessionId: rlSession, bets: [{ key: "red", amount: 50 }] },
        });
        check(
            "roulette legit spin settles (won is 0 or 100)",
            r.status === 200 && (r.json.won === 0 || Math.abs(r.json.won - 100) < 0.01),
            r
        );

        r = await call("GET", "/api/game/active?gameType=MINES", { token });
        check("active session false after settle", r.status === 200 && r.json.active === false, r);

        // ============================================================
        // CONCURRENCY: 10 simultaneous cash-outs on ONE session must pay EXACTLY
        // once (the atomic ACTIVE→settled claim). This is the "handle multiple
        // requests at the same time" guarantee — and a double-settle exploit guard.
        // ============================================================
        r = await call("POST", "/api/game/start", {
            token,
            body: { amount: 100, gameType: "MINES", gameConfig: { mineCount: 3 } },
        });
        const raceSession = r.json.sessionId;
        const raceDoc: any = await GameSession.findById(raceSession).select("+outcome").lean();
        const raceSafe = Array.from({ length: 25 }, (_, i) => i).filter(
            (i) => !raceDoc.outcome.mines.includes(i)
        );
        // Reveal two safe tiles so the multiplier is comfortably > 1.
        await call("POST", "/api/game/mines/reveal", {
            token,
            body: { sessionId: raceSession, tileIndex: raceSafe[0] },
        });
        await call("POST", "/api/game/mines/reveal", {
            token,
            body: { sessionId: raceSession, tileIndex: raceSafe[1] },
        });
        const before: any = await call("GET", "/api/wallet/balance", { token });
        const balBefore = before.json.walletBalance;
        // Fire 10 cash-outs at once.
        const settles = await Promise.all(
            Array.from({ length: 10 }, () =>
                call("POST", "/api/game/cashout", { token, body: { sessionId: raceSession } })
            )
        );
        const wins = settles.filter((s) => s.status === 200);
        const after: any = await call("GET", "/api/wallet/balance", { token });
        const credited = after.json.walletBalance - balBefore;
        const oneWinAmount = wins[0]?.json?.winAmount ?? 0;
        check(
            "10 concurrent cashouts credit EXACTLY once",
            wins.length === 1 && Math.abs(credited - oneWinAmount) < 0.02,
            { wins: wins.length, credited, oneWinAmount }
        );

        // Concurrent duplicate welcome-bonus claims can't double-pay (already
        // claimed above, so both should now reject — but assert the atomic path).
        const bonusRace = await Promise.all([
            call("POST", "/api/bonus/claim-welcome", { token }),
            call("POST", "/api/bonus/claim-welcome", { token }),
        ]);
        check(
            "concurrent bonus claims never double-pay",
            bonusRace.every((b) => b.status === 400),
            bonusRace.map((b) => b.status)
        );

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
