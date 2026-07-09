import crypto from "crypto";

/**
 * GameOutcome — the authoritative, server-owned outcome for every game.
 *
 * SECURITY: this is the trust boundary. The client never generates a board,
 * never picks a winning number, and never asserts a multiplier or a win amount.
 * The server resolves the outcome here from a CSPRNG at bet time, hides it in the
 * session, and computes every payout itself. The client only ever tells the
 * server WHICH tile/number/bet it chose — never what it's worth.
 *
 * Formulas are ported 1:1 from the original client so payouts a player sees on
 * screen exactly match what the server credits.
 */

/** Uniform integer in [0, max) from a cryptographically secure source. */
export function secureRandInt(max: number): number {
    if (max <= 0) return 0;
    return crypto.randomInt(max);
}

/** Fisher–Yates over [0, n) using the CSPRNG; first k form the picked set. */
function securePick(n: number, k: number): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k).sort((x, y) => x - y);
}

/* ============================== MINES ============================== */

export const MINES_TILE_COUNT = 25;
export const MINES_MIN = 1;
export const MINES_MAX = 24;

/** Mine positions on a 25-cell board (indices 0–24). */
export function generateMines(mineCount: number): number[] {
    const count = Math.max(MINES_MIN, Math.min(MINES_MAX, Math.floor(mineCount) || 3));
    return securePick(MINES_TILE_COUNT, count);
}

/**
 * Fair Mines multiplier after `safeRevealed` gems on a board with `mineCount`
 * mines. Product of (tiles−i)/(safe−i) with a 4% house edge — identical to the
 * client's calculateMultiplier.
 */
export function minesMultiplier(mineCount: number, safeRevealed: number): number {
    const safeTiles = MINES_TILE_COUNT - mineCount;
    let mult = 1;
    for (let i = 0; i < safeRevealed; i++) {
        mult *= (MINES_TILE_COUNT - i) / (safeTiles - i);
    }
    return mult * 0.96;
}

/* =========================== DRAGON TOWER =========================== */

export const DRAGON_ROWS = 10;
/** difficulty = tiles per row: Low=4, Medium=3, High=2. */
export const DRAGON_TILES: Record<string, number> = { Low: 4, Medium: 3, High: 2 };
const DRAGON_STEP: Record<number, number> = { 4: 1.4, 3: 1.6, 2: 1.8 };

/** One dragon tile index per row, in [0, tilesPerRow). */
export function generateDragons(tilesPerRow: number): number[] {
    const tiles = DRAGON_TILES_VALUES.includes(tilesPerRow) ? tilesPerRow : 4;
    return Array.from({ length: DRAGON_ROWS }, () => secureRandInt(tiles));
}
const DRAGON_TILES_VALUES = [2, 3, 4];

/** stepFactor^floorsClimbed — identical to the client's getMultiplier. */
export function dragonMultiplier(tilesPerRow: number, floorsClimbed: number): number {
    const step = DRAGON_STEP[tilesPerRow] ?? 1.4;
    return step ** floorsClimbed;
}

/* ============================== WHEEL ============================== */

export const WHEEL_RISKS = ["low", "medium", "hard"] as const;
export const WHEEL_SEGMENT_COUNTS = [10, 20, 30, 40];

const WHEEL_STRUCTURE: Record<"low" | "medium", string[]> = {
    low: ["0.00x", "1.20x", "1.20x", "1.20x", "1.50x", "0.00x", "1.20x", "1.20x", "1.20x", "1.20x"],
    medium: ["0.00x", "1.50x", "0.00x", "2.00x", "0.00x", "1.50x", "0.00x", "3.00x", "0.00x", "1.50x"],
};

/** Build the segment label ring for a (risk, count) — matches the client. */
export function wheelSegments(risk: string, count: number): string[] {
    const n = WHEEL_SEGMENT_COUNTS.includes(count) ? count : 20;
    if (risk === "hard") {
        const jackpot = `${(n - 0.5).toFixed(2)}x`;
        return [jackpot, ...Array.from({ length: n - 1 }, () => "0.00x")];
    }
    const diff = risk === "medium" ? "medium" : "low";
    const segs: string[] = [];
    const times = Math.floor(n / 10);
    for (let i = 0; i < times; i++) segs.push(...WHEEL_STRUCTURE[diff]);
    return segs;
}

/** Resolve a spin: pick a segment, return its index and multiplier. */
export function spinWheelOutcome(risk: string, count: number): { index: number; multiplier: number } {
    const segs = wheelSegments(risk, count);
    const index = secureRandInt(segs.length);
    const multiplier = parseFloat(segs[index]);
    return { index, multiplier };
}

/* ============================= ROULETTE ============================= */

/** European single-zero wheel order (index → pocket number). Matches the client. */
export const ROULETTE_WHEEL = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31,
    9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Authoritative outside-bet catalog: key → covered pockets + total-return multiplier. */
const OUTSIDE_BETS: Record<string, { numbers: number[]; mult: number }> = {
    c1: { numbers: range(1, 36).filter((n) => n % 3 === 1), mult: 3 },
    c2: { numbers: range(1, 36).filter((n) => n % 3 === 2), mult: 3 },
    c3: { numbers: range(1, 36).filter((n) => n % 3 === 0), mult: 3 },
    d1: { numbers: range(1, 12), mult: 3 },
    d2: { numbers: range(13, 24), mult: 3 },
    d3: { numbers: range(25, 36), mult: 3 },
    low: { numbers: range(1, 18), mult: 2 },
    high: { numbers: range(19, 36), mult: 2 },
    even: { numbers: range(1, 36).filter((n) => n % 2 === 0), mult: 2 },
    odd: { numbers: range(1, 36).filter((n) => n % 2 === 1), mult: 2 },
    red: { numbers: [...RED], mult: 2 },
    black: { numbers: range(1, 36).filter((n) => !RED.has(n)), mult: 2 },
};

export interface RouletteBetInput {
    key: string;
    amount: number;
}

export interface ResolvedRouletteBet {
    key: string;
    amount: number;
    numbers: number[];
    mult: number;
}

/**
 * Reconstruct the AUTHORITATIVE numbers + payout for a client-chosen bet key.
 * The client may only choose WHICH bet and HOW MUCH; the covered numbers and the
 * multiplier are derived here from the key, never trusted from the client. Inside
 * bets encode their pockets in the key (`i<sorted-pockets-joined-by->`); the
 * server re-parses and re-prices them (mult = 36 / pocketsCovered). Returns null
 * for any malformed / out-of-range key so the whole spin can be rejected.
 */
export function resolveRouletteBet(key: string, amount: number): ResolvedRouletteBet | null {
    if (!key || typeof amount !== "number" || !isFinite(amount) || amount <= 0) return null;

    const outside = OUTSIDE_BETS[key];
    if (outside) return { key, amount, numbers: outside.numbers, mult: outside.mult };

    // Straight/split/street/corner/six-line encoded as "i<n>-<n>-..."
    if (key.startsWith("i")) {
        const parts = key.slice(1).split("-");
        if (parts.length < 1 || parts.length > 6) return null;
        const nums: number[] = [];
        for (const p of parts) {
            if (!/^\d{1,2}$/.test(p)) return null;
            const n = Number(p);
            if (n < 0 || n > 36 || nums.includes(n)) return null;
            nums.push(n);
        }
        return { key, amount, numbers: nums, mult: 36 / nums.length };
    }

    // "s0" straight-up on zero (or any straight key the client emits for a pocket)
    if (/^s\d{1,2}$/.test(key)) {
        const n = Number(key.slice(1));
        if (n < 0 || n > 36) return null;
        return { key, amount, numbers: [n], mult: 36 };
    }

    return null;
}

/** Resolve a roulette spin: pick a pocket via CSPRNG, return its wheel index + number. */
export function spinRouletteOutcome(): { index: number; number: number } {
    const index = secureRandInt(ROULETTE_WHEEL.length);
    return { index, number: ROULETTE_WHEEL[index] };
}
