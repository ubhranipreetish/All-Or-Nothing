import { Card } from "./cards";

/**
 * 7-card hand evaluation for Texas Hold'em.
 *
 * `evaluate7` returns a comparable score: a category (8 = straight flush … 0 =
 * high card) plus tiebreak ranks. Compare two scores with `compareScore`
 * (lexicographic). This is the single source of truth for who wins a showdown.
 */

export interface HandScore {
    cat: number; // 8 SF, 7 quads, 6 full house, 5 flush, 4 straight, 3 trips, 2 two pair, 1 pair, 0 high
    tie: number[]; // tiebreak ranks, most significant first
    name: string;
}

const CAT_NAMES = [
    "High Card", "Pair", "Two Pair", "Three of a Kind", "Straight",
    "Flush", "Full House", "Four of a Kind", "Straight Flush",
];

/** Highest card of a straight contained in `ranks` (a set of distinct ranks), or 0. */
function straightHigh(rankSet: Set<number>): number {
    // Ace plays low for the wheel (A-2-3-4-5).
    const ranks = new Set(rankSet);
    if (ranks.has(14)) ranks.add(1);
    for (let high = 14; high >= 5; high--) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (!ranks.has(high - k)) { ok = false; break; }
        if (ok) return high;
    }
    return 0;
}

export function evaluate7(cards: Card[]): HandScore {
    const byRank = new Map<number, number>(); // rank -> count
    const bySuit = new Map<string, Card[]>();
    for (const c of cards) {
        byRank.set(c.r, (byRank.get(c.r) || 0) + 1);
        const arr = bySuit.get(c.s) || [];
        arr.push(c);
        bySuit.set(c.s, arr);
    }

    // Flush / straight-flush
    let flushSuit: string | null = null;
    for (const [s, arr] of bySuit) if (arr.length >= 5) flushSuit = s;

    if (flushSuit) {
        const suited = new Set(bySuit.get(flushSuit)!.map((c) => c.r));
        const sfHigh = straightHigh(suited);
        if (sfHigh) return { cat: 8, tie: [sfHigh], name: sfHigh === 14 ? "Royal Flush" : "Straight Flush" };
    }

    // group ranks by count, then by rank desc
    const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const counts = groups.map((g) => g[1]);
    const ranksDesc = [...byRank.keys()].sort((a, b) => b - a);

    // Four of a kind
    if (counts[0] === 4) {
        const quad = groups[0][0];
        const kicker = ranksDesc.filter((r) => r !== quad)[0];
        return { cat: 7, tie: [quad, kicker], name: CAT_NAMES[7] };
    }
    // Full house (trips + pair, or two trips)
    if (counts[0] === 3 && counts[1] >= 2) {
        const trips = groups[0][0];
        const pair = groups.filter((g) => g[0] !== trips && g[1] >= 2).map((g) => g[0]).sort((a, b) => b - a)[0];
        return { cat: 6, tie: [trips, pair], name: CAT_NAMES[6] };
    }
    // Flush
    if (flushSuit) {
        const top5 = bySuit.get(flushSuit)!.map((c) => c.r).sort((a, b) => b - a).slice(0, 5);
        return { cat: 5, tie: top5, name: CAT_NAMES[5] };
    }
    // Straight
    const sHigh = straightHigh(new Set(byRank.keys()));
    if (sHigh) return { cat: 4, tie: [sHigh], name: CAT_NAMES[4] };
    // Trips
    if (counts[0] === 3) {
        const trips = groups[0][0];
        const kick = ranksDesc.filter((r) => r !== trips).slice(0, 2);
        return { cat: 3, tie: [trips, ...kick], name: CAT_NAMES[3] };
    }
    // Two pair / one pair
    const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]).sort((a, b) => b - a);
    if (pairs.length >= 2) {
        const [hi, lo] = pairs;
        const kick = ranksDesc.filter((r) => r !== hi && r !== lo)[0];
        return { cat: 2, tie: [hi, lo, kick], name: CAT_NAMES[2] };
    }
    if (pairs.length === 1) {
        const p = pairs[0];
        const kick = ranksDesc.filter((r) => r !== p).slice(0, 3);
        return { cat: 1, tie: [p, ...kick], name: CAT_NAMES[1] };
    }
    // High card
    return { cat: 0, tie: ranksDesc.slice(0, 5), name: CAT_NAMES[0] };
}

/** >0 if a beats b, <0 if b beats a, 0 if tie. */
export function compareScore(a: HandScore, b: HandScore): number {
    if (a.cat !== b.cat) return a.cat - b.cat;
    for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
        const d = (a.tie[i] || 0) - (b.tie[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}
