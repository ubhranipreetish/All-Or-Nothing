/**
 * Pure card primitives for Texas Hold'em. No framework code — just data + a
 * shuffled deck. Ranks are numeric (2..14, Ace high); suits are single letters.
 */

export type Suit = "s" | "h" | "d" | "c";
export interface Card {
    r: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
    s: Suit;
}

const SUITS: Suit[] = ["s", "h", "d", "c"];

export function makeDeck(): Card[] {
    const deck: Card[] = [];
    for (const s of SUITS) {
        for (let r = 2; r <= 14; r++) deck.push({ r, s });
    }
    return deck;
}

/** Fisher–Yates shuffle. */
export function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function cardCode(c: Card): string {
    const rank = c.r <= 10 ? String(c.r) : { 11: "J", 12: "Q", 13: "K", 14: "A" }[c.r];
    return `${rank}${c.s}`;
}
