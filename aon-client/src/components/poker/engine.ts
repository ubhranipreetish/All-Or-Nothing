/* Backend-free poker engine for the /poker-test harness. A faithful client port
   of the server's domain logic (cards + 7-card evaluator + table state machine
   + sit-out/rebuy/timeout), plus a serializer that emits the same TableState the
   live socket sends — so the same <PokerTable/> UI renders it unchanged. */

import { Card, TableState, SeatView, Legal } from "./types";

type Suit = Card["s"];
const SUITS: Suit[] = ["s", "h", "d", "c"];

function makeDeck(): Card[] {
    const d: Card[] = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
}
function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ---------------------------------------------------- hand evaluation */
interface HandScore { cat: number; tie: number[]; name: string }
const CAT_NAMES = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];

function straightHigh(rankSet: Set<number>): number {
    const ranks = new Set(rankSet);
    if (ranks.has(14)) ranks.add(1);
    for (let high = 14; high >= 5; high--) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (!ranks.has(high - k)) { ok = false; break; }
        if (ok) return high;
    }
    return 0;
}
function evaluate7(cards: Card[]): HandScore {
    const byRank = new Map<number, number>();
    const bySuit = new Map<string, Card[]>();
    for (const c of cards) {
        byRank.set(c.r, (byRank.get(c.r) || 0) + 1);
        const arr = bySuit.get(c.s) || [];
        arr.push(c);
        bySuit.set(c.s, arr);
    }
    let flushSuit: string | null = null;
    for (const [s, arr] of bySuit) if (arr.length >= 5) flushSuit = s;
    if (flushSuit) {
        const suited = new Set(bySuit.get(flushSuit)!.map((c) => c.r));
        const sf = straightHigh(suited);
        if (sf) return { cat: 8, tie: [sf], name: sf === 14 ? "Royal Flush" : "Straight Flush" };
    }
    const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const counts = groups.map((g) => g[1]);
    const ranksDesc = [...byRank.keys()].sort((a, b) => b - a);
    if (counts[0] === 4) {
        const quad = groups[0][0];
        return { cat: 7, tie: [quad, ranksDesc.filter((r) => r !== quad)[0]], name: CAT_NAMES[7] };
    }
    if (counts[0] === 3 && counts[1] >= 2) {
        const trips = groups[0][0];
        const pair = groups.filter((g) => g[0] !== trips && g[1] >= 2).map((g) => g[0]).sort((a, b) => b - a)[0];
        return { cat: 6, tie: [trips, pair], name: CAT_NAMES[6] };
    }
    if (flushSuit) {
        const top5 = bySuit.get(flushSuit)!.map((c) => c.r).sort((a, b) => b - a).slice(0, 5);
        return { cat: 5, tie: top5, name: CAT_NAMES[5] };
    }
    const sH = straightHigh(new Set(byRank.keys()));
    if (sH) return { cat: 4, tie: [sH], name: CAT_NAMES[4] };
    if (counts[0] === 3) {
        const trips = groups[0][0];
        return { cat: 3, tie: [trips, ...ranksDesc.filter((r) => r !== trips).slice(0, 2)], name: CAT_NAMES[3] };
    }
    const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]).sort((a, b) => b - a);
    if (pairs.length >= 2) {
        const [hi, lo] = pairs;
        return { cat: 2, tie: [hi, lo, ranksDesc.filter((r) => r !== hi && r !== lo)[0]], name: CAT_NAMES[2] };
    }
    if (pairs.length === 1) {
        const p = pairs[0];
        return { cat: 1, tie: [p, ...ranksDesc.filter((r) => r !== p).slice(0, 3)], name: CAT_NAMES[1] };
    }
    return { cat: 0, tie: ranksDesc.slice(0, 5), name: CAT_NAMES[0] };
}
function compareScore(a: HandScore, b: HandScore): number {
    if (a.cat !== b.cat) return a.cat - b.cat;
    for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
        const d = (a.tie[i] || 0) - (b.tie[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}

/* ------------------------------------------------------------- table */
export type ActionType = "fold" | "check" | "call" | "bet" | "raise";
interface Seat {
    id: string; name: string; stack: number; bet: number; committed: number;
    folded: boolean; allIn: boolean; acted: boolean; cards: Card[];
    away: boolean; disconnected: boolean; missed: number; inHand: boolean; lastAction?: string;
}
const MAX = 6;
const SIT_OUT_AFTER = 2;

export class LocalTable {
    seats: (Seat | null)[] = Array(MAX).fill(null);
    phase: TableState["phase"] = "waiting";
    community: Card[] = [];
    dealer = 0;
    sbSeat = -1;
    bbSeat = -1;
    currentBet = 0;
    minRaise: number;
    toAct = -1;
    handId = 0;
    winners: { seat: number; amount: number; handName: string }[] | null = null;
    handActive = false;
    deadlineTs: number | null = null;
    private deck: Card[] = [];

    constructor(public id = "TEST", public smallBlind = 5, public bigBlind = 10, public startingStack = 1000) {
        this.minRaise = bigBlind;
    }

    seat(id: string, name: string): number {
        const idx = this.seats.findIndex((s) => s === null);
        if (idx === -1) return -1;
        this.seats[idx] = { id, name, stack: this.startingStack, bet: 0, committed: 0, folded: false, allIn: false, acted: false, cards: [], away: false, disconnected: false, missed: 0, inHand: false };
        return idx;
    }

    private dealt(): number[] {
        return this.seats.map((s, i) => (s && s.stack > 0 && !s.away ? i : -1)).filter((i) => i >= 0);
    }
    occupied(): number[] {
        return this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    }

    sitOut(id: string): void {
        const i = this.seats.findIndex((s) => s?.id === id);
        if (i === -1) return;
        this.seats[i]!.away = true;
        if (this.handActive && this.toAct === i) { this.seats[i]!.folded = true; this.seats[i]!.lastAction = "Fold"; this.after(i); }
    }
    sitIn(id: string): void {
        const s = this.seats.find((x) => x?.id === id);
        if (s && s.stack > 0) { s.away = false; s.missed = 0; }
    }
    rebuy(id: string): boolean {
        const s = this.seats.find((x) => x?.id === id);
        if (!s || (this.handActive && s.inHand) || s.stack >= this.startingStack) return false;
        s.stack = this.startingStack; s.away = false; s.missed = 0;
        return true;
    }

    maybeStartHand(): boolean {
        if (this.handActive || this.dealt().length < 2) return false;
        this.start();
        return true;
    }
    private start(): void {
        const dealt = this.dealt();
        this.dealer = this.nextInList(dealt, this.dealer);
        const ring: number[] = [];
        for (let k = 0; k < MAX; k++) { const i = (this.dealer + k) % MAX; if (dealt.includes(i)) ring.push(i); }
        const n = dealt.length;
        this.deck = shuffle(makeDeck());
        this.community = []; this.winners = null; this.phase = "preflop"; this.handActive = true; this.handId++;
        for (let i = 0; i < MAX; i++) {
            const s = this.seats[i]; if (!s) continue;
            s.bet = 0; s.committed = 0; s.folded = false; s.allIn = false; s.acted = false; s.cards = []; s.lastAction = undefined;
            s.inHand = dealt.includes(i);
        }
        for (let k = 0; k < 2; k++) for (const i of dealt) this.seats[i]!.cards.push(this.deck.pop()!);
        this.sbSeat = n === 2 ? ring[0] : ring[1];
        this.bbSeat = n === 2 ? ring[1] : ring[2 % n];
        this.blind(this.sbSeat, this.smallBlind, "SB");
        this.blind(this.bbSeat, this.bigBlind, "BB");
        this.currentBet = this.bigBlind; this.minRaise = this.bigBlind;
        this.toAct = n === 2 ? ring[0] : this.nextActiveAfter(this.bbSeat);
    }
    private blind(i: number, amt: number, label: string): void {
        this.contribute(i, amt); this.seats[i]!.acted = false; this.seats[i]!.lastAction = label;
    }
    private contribute(i: number, amt: number): void {
        const s = this.seats[i]!;
        const pay = Math.min(s.stack, amt);
        s.stack -= pay; s.bet += pay; s.committed += pay;
        if (s.stack === 0) s.allIn = true;
    }

    act(playerId: string, action: ActionType, amount = 0): string | null {
        if (!this.handActive) return "No hand";
        if (this.toAct < 0 || this.seats[this.toAct]?.id !== playerId) return "Not your turn";
        const idx = this.toAct;
        const s = this.seats[idx]!;
        const toCall = this.currentBet - s.bet;
        switch (action) {
            case "fold": s.folded = true; s.lastAction = "Fold"; break;
            case "check": if (toCall > 0) return "Cannot check"; s.lastAction = "Check"; break;
            case "call": if (toCall <= 0) return "Nothing to call"; this.contribute(idx, toCall); s.lastAction = s.allIn ? "All-in" : "Call"; break;
            case "bet":
            case "raise": {
                const raiseTo = Math.floor(amount);
                const maxTo = s.bet + s.stack;
                if (raiseTo <= this.currentBet && raiseTo < maxTo) return "Raise too small";
                const minTo = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise;
                const isAllIn = raiseTo >= maxTo;
                if (raiseTo < minTo && !isAllIn) return `Minimum is ${minTo}`;
                const finalTo = Math.min(raiseTo, maxTo);
                const raiseSize = finalTo - this.currentBet;
                this.contribute(idx, finalTo - s.bet);
                if (raiseSize >= this.minRaise) {
                    this.minRaise = raiseSize;
                    for (const j of this.dealt()) if (j !== idx && !this.seats[j]!.folded && !this.seats[j]!.allIn) this.seats[j]!.acted = false;
                }
                this.currentBet = Math.max(this.currentBet, finalTo);
                s.lastAction = s.allIn ? "All-in" : raiseSize === finalTo ? "Bet" : "Raise";
                break;
            }
        }
        s.acted = true; s.missed = 0;
        this.after(idx);
        return null;
    }

    timeoutCurrent(): void {
        if (!this.handActive || this.toAct < 0) return;
        const s = this.seats[this.toAct]!;
        const canCheck = this.currentBet - s.bet <= 0;
        const id = s.id;
        const willSitOut = s.missed + 1 >= SIT_OUT_AFTER;
        this.act(id, canCheck ? "check" : "fold");
        const after = this.seats.find((x) => x?.id === id);
        if (after && willSitOut) { after.away = true; after.missed = SIT_OUT_AFTER; }
        else if (after) after.missed += 1;
    }

    private after(from: number): void {
        const live = this.dealt().filter((i) => !this.seats[i]!.folded);
        if (live.length === 1) { this.endUncontested(live[0]); return; }
        const next = this.nextToAct(from);
        if (next === -1) this.advance();
        else this.toAct = next;
    }
    private advance(): void {
        for (const i of this.dealt()) { this.seats[i]!.bet = 0; this.seats[i]!.acted = false; }
        this.currentBet = 0; this.minRaise = this.bigBlind;
        if (this.phase === "preflop") { this.phase = "flop"; this.dealN(3); }
        else if (this.phase === "flop") { this.phase = "turn"; this.dealN(1); }
        else if (this.phase === "turn") { this.phase = "river"; this.dealN(1); }
        else { this.showdown(); return; }
        const first = this.nextActiveAfter(this.dealer);
        if (first === -1 || this.canAct() < 2) { this.advance(); return; }
        this.toAct = first;
    }
    private dealN(n: number): void { for (let i = 0; i < n; i++) this.community.push(this.deck.pop()!); }

    private endUncontested(w: number): void {
        const pot = this.pot();
        this.seats[w]!.stack += pot;
        this.winners = [{ seat: w, amount: pot, handName: "Uncontested" }];
        this.finish();
    }
    private showdown(): void {
        this.phase = "showdown";
        const pots = this.buildPots();
        const scores = new Map<number, HandScore>();
        for (const i of this.dealt()) if (this.seats[i]!.inHand && !this.seats[i]!.folded) scores.set(i, evaluate7([...this.community, ...this.seats[i]!.cards]));
        const won = new Map<number, { amount: number; handName: string }>();
        for (const pot of pots) {
            const contenders = pot.eligible.filter((i) => scores.has(i));
            if (!contenders.length) continue;
            let best = contenders[0];
            for (const i of contenders) if (compareScore(scores.get(i)!, scores.get(best)!) > 0) best = i;
            const ws = contenders.filter((i) => compareScore(scores.get(i)!, scores.get(best)!) === 0);
            const share = Math.floor(pot.amount / ws.length);
            let rem = pot.amount - share * ws.length;
            for (const i of ws) {
                const give = share + (rem-- > 0 ? 1 : 0);
                this.seats[i]!.stack += give;
                const p = won.get(i);
                won.set(i, { amount: (p?.amount || 0) + give, handName: scores.get(i)!.name });
            }
        }
        this.winners = [...won.entries()].map(([seat, w]) => ({ seat, amount: w.amount, handName: w.handName }));
        this.finish();
    }
    private buildPots(): { amount: number; eligible: number[] }[] {
        let c = this.occupied().map((i) => ({ i, amt: this.seats[i]!.committed, folded: this.seats[i]!.folded })).filter((x) => x.amt > 0);
        const pots: { amount: number; eligible: number[] }[] = [];
        while (c.length) {
            const min = Math.min(...c.map((x) => x.amt));
            let amount = 0;
            for (const x of c) { amount += min; x.amt -= min; }
            pots.push({ amount, eligible: c.filter((x) => !x.folded).map((x) => x.i) });
            c = c.filter((x) => x.amt > 0);
        }
        return pots;
    }
    private finish(): void {
        this.handActive = false; this.toAct = -1; this.deadlineTs = null;
        for (const s of this.seats) { if (!s) continue; s.committed = 0; s.inHand = false; if (s.stack <= 0) s.away = true; }
    }

    private nextInList(list: number[], from: number): number {
        for (let k = 1; k <= MAX; k++) { const i = (from + k) % MAX; if (list.includes(i)) return i; }
        return from;
    }
    private nextActiveAfter(from: number): number {
        for (let k = 1; k <= MAX; k++) {
            const i = (from + k) % MAX; const s = this.seats[i];
            if (s && s.inHand && !s.folded && !s.allIn && s.stack > 0) return i;
        }
        return -1;
    }
    private nextToAct(from: number): number {
        for (let k = 1; k <= MAX; k++) {
            const i = (from + k) % MAX; const s = this.seats[i];
            if (!s || !s.inHand || s.folded || s.allIn) continue;
            if (!s.acted || s.bet < this.currentBet) return i;
        }
        return -1;
    }
    private canAct(): number {
        return this.dealt().filter((i) => this.seats[i]!.inHand && !this.seats[i]!.folded && !this.seats[i]!.allIn).length;
    }
    pot(): number {
        return this.seats.reduce((sum, s) => sum + (s?.committed || 0), 0);
    }
    currentActorId(): string | null {
        return this.toAct >= 0 ? this.seats[this.toAct]?.id ?? null : null;
    }

    view(viewerId: string): TableState {
        const reveal = this.phase === "showdown";
        const winnerSeats = new Set((this.winners || []).map((w) => w.seat));
        const me = this.seats.find((s) => s?.id === viewerId);
        const seats: (SeatView | null)[] = this.seats.map((s, i) =>
            s
                ? {
                      seat: i, name: s.name, stack: s.stack, bet: s.bet, folded: s.folded, allIn: s.allIn,
                      away: s.away, disconnected: s.disconnected, lastAction: s.lastAction,
                      isTurn: this.toAct === i, isYou: s.id === viewerId,
                      isDealer: this.dealer === i && this.handActive,
                      blind: this.handActive ? (this.sbSeat === i ? "SB" : this.bbSeat === i ? "BB" : null) : null,
                      isWinner: winnerSeats.has(i), hasCards: s.cards.length > 0,
                      cards: s.id === viewerId || (reveal && !s.folded && s.inHand) ? s.cards : null,
                  }
                : null,
        );
        return {
            tableId: this.id, phase: this.phase, community: this.community, pot: this.pot(),
            currentBet: this.currentBet, bigBlind: this.bigBlind, smallBlind: this.smallBlind, startingStack: this.startingStack,
            dealer: this.dealer, toAct: this.toAct, handId: this.handId, handActive: this.handActive,
            winners: this.winners, deadlineTs: this.deadlineTs, serverNow: Date.now(), turnSeconds: 20,
            youId: viewerId, youSeated: !!me, youAway: !!me?.away, youCanRebuy: !!me && !me.inHand && me.stack < this.startingStack,
            seats, legal: this.legal(viewerId),
        };
    }
    private legal(viewerId: string): Legal | null {
        if (this.toAct < 0 || this.seats[this.toAct]?.id !== viewerId) return null;
        const s = this.seats[this.toAct]!;
        const toCall = this.currentBet - s.bet;
        const callAmount = Math.min(toCall, s.stack);
        const minRaiseTo = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise;
        const maxRaiseTo = s.bet + s.stack;
        return {
            toCall, canCheck: toCall <= 0, canCall: toCall > 0 && s.stack > 0, callAmount,
            canRaise: s.stack > callAmount && maxRaiseTo > this.currentBet,
            minRaiseTo: Math.min(minRaiseTo, maxRaiseTo), maxRaiseTo, isBet: this.currentBet === 0,
        };
    }
}

/* ------------------------------------------------ a simple bot policy */
export function botAction(table: LocalTable): { type: ActionType; amount?: number } {
    const i = table.toAct;
    const s = table.seats[i]!;
    const toCall = table.currentBet - s.bet;
    const r = Math.random();
    if (toCall <= 0) {
        if (r < 0.18 && s.stack > table.bigBlind * 2) return { type: "bet", amount: Math.min(s.bet + s.stack, table.bigBlind * (2 + Math.floor(r * 6))) };
        return { type: "check" };
    }
    if (toCall >= s.stack) return r < 0.7 ? { type: "fold" } : { type: "call" };
    if (toCall > s.stack * 0.5 && r < 0.55) return { type: "fold" };
    if (r < 0.12 && s.stack > toCall * 2) {
        const minTo = table.currentBet + table.minRaise;
        return { type: "raise", amount: Math.min(s.bet + s.stack, minTo + table.bigBlind * Math.floor(r * 10)) };
    }
    if (r < 0.78) return { type: "call" };
    return { type: "fold" };
}
