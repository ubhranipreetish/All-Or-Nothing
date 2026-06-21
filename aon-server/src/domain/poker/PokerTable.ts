import { Card, makeDeck, shuffle } from "./cards";
import { evaluate7, compareScore, HandScore } from "./handEvaluator";

/**
 * PokerTable — the authoritative Texas Hold'em engine for one table (max 6).
 *
 * Pure, in-memory game logic: seating, blinds, dealing, betting rounds, side
 * pots and showdown. It holds the FULL truth (including every hole card); the
 * realtime layer is responsible for serialising a per-viewer, sanitised view so
 * players never see each other's cards before showdown.
 */

export type Phase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
export type ActionType = "fold" | "check" | "call" | "bet" | "raise";

export interface Seat {
    id: string;
    name: string;
    stack: number;
    bet: number; // committed this street
    committed: number; // committed this hand (for side pots)
    folded: boolean;
    allIn: boolean;
    acted: boolean; // has acted since the last bet/raise this street
    cards: Card[];
    sittingOut: boolean;
    connected: boolean;
    lastAction?: string;
}

export interface Winner {
    seat: number;
    amount: number;
    handName: string;
}

const MAX_SEATS = 6;

export class PokerTable {
    seats: (Seat | null)[] = Array(MAX_SEATS).fill(null);
    phase: Phase = "waiting";
    community: Card[] = [];
    dealer = 0;
    currentBet = 0;
    minRaise: number;
    toAct = -1;
    handId = 0;
    winners: Winner[] | null = null;
    handActive = false;
    lastResultAt = 0;

    private deck: Card[] = [];

    constructor(
        public readonly id: string,
        public readonly smallBlind = 5,
        public readonly bigBlind = 10,
        public readonly startingStack = 1000,
    ) {
        this.minRaise = bigBlind;
    }

    /* ----------------------------------------------------------- seating */

    seatPlayer(id: string, name: string): number {
        if (this.seats.some((s) => s && s.id === id)) {
            return this.seats.findIndex((s) => s?.id === id);
        }
        const idx = this.seats.findIndex((s) => s === null);
        if (idx === -1) return -1;
        this.seats[idx] = {
            id, name, stack: this.startingStack, bet: 0, committed: 0,
            folded: false, allIn: false, acted: false, cards: [],
            sittingOut: false, connected: true,
        };
        return idx;
    }

    removePlayer(id: string): void {
        const idx = this.seats.findIndex((s) => s?.id === id);
        if (idx === -1) return;
        // If they're in a live hand, treat leaving as a fold first.
        if (this.handActive && !this.seats[idx]!.folded) {
            this.seats[idx]!.folded = true;
            if (this.toAct === idx) this.advanceAfterAction(idx);
        }
        this.seats[idx] = null;
    }

    setConnected(id: string, connected: boolean): void {
        const s = this.seats.find((x) => x?.id === id);
        if (s) s.connected = connected;
    }

    occupied(): number[] {
        return this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    }

    private dealtSeats(): number[] {
        return this.seats
            .map((s, i) => (s && s.stack > 0 && !s.sittingOut ? i : -1))
            .filter((i) => i >= 0);
    }

    /* ------------------------------------------------------- hand lifecycle */

    maybeStartHand(): boolean {
        if (this.handActive) return false;
        if (this.dealtSeats().length < 2) return false;
        this.startHand();
        return true;
    }

    private startHand(): void {
        const dealt = this.dealtSeats();
        // advance the button to the next dealt seat
        this.dealer = this.nextSeatInList(dealt, this.dealer);
        const ring = this.ringFromDealer(dealt); // ring[0] = dealer
        const n = dealt.length;

        this.deck = shuffle(makeDeck());
        this.community = [];
        this.winners = null;
        this.phase = "preflop";
        this.handActive = true;
        this.handId++;

        for (const i of dealt) {
            const s = this.seats[i]!;
            s.bet = 0; s.committed = 0; s.folded = false; s.allIn = false;
            s.acted = false; s.cards = []; s.lastAction = undefined;
        }
        // deal two hole cards each
        for (let k = 0; k < 2; k++) for (const i of dealt) this.seats[i]!.cards.push(this.deck.pop()!);

        const sb = n === 2 ? ring[0] : ring[1];
        const bb = n === 2 ? ring[1] : ring[2 % n];
        this.postBlind(sb, this.smallBlind, "SB");
        this.postBlind(bb, this.bigBlind, "BB");

        this.currentBet = this.bigBlind;
        this.minRaise = this.bigBlind;
        // first to act preflop: heads-up = dealer/SB, else seat after BB
        this.toAct = n === 2 ? ring[0] : this.nextActiveAfter(bb);
    }

    private postBlind(idx: number, amount: number, label: string): void {
        this.contribute(idx, amount);
        this.seats[idx]!.acted = false; // blinds still get to act
        this.seats[idx]!.lastAction = label;
    }

    private contribute(idx: number, amount: number): void {
        const s = this.seats[idx]!;
        const pay = Math.min(s.stack, amount);
        s.stack -= pay;
        s.bet += pay;
        s.committed += pay;
        if (s.stack === 0) s.allIn = true;
    }

    /* ------------------------------------------------------------- actions */

    /** Apply a player action. Returns an error string, or null on success. */
    act(playerId: string, action: ActionType, amount = 0): string | null {
        if (!this.handActive) return "No hand in progress";
        if (this.toAct < 0 || this.seats[this.toAct]?.id !== playerId) return "Not your turn";
        const idx = this.toAct;
        const s = this.seats[idx]!;
        const toCall = this.currentBet - s.bet;

        switch (action) {
            case "fold":
                s.folded = true; s.acted = true; s.lastAction = "Fold";
                break;
            case "check":
                if (toCall > 0) return "Cannot check facing a bet";
                s.acted = true; s.lastAction = "Check";
                break;
            case "call": {
                if (toCall <= 0) return "Nothing to call";
                this.contribute(idx, toCall);
                s.acted = true; s.lastAction = s.allIn ? "All-in" : "Call";
                break;
            }
            case "bet":
            case "raise": {
                const raiseTo = Math.floor(amount);
                const maxTo = s.bet + s.stack; // shove ceiling
                if (raiseTo <= this.currentBet && raiseTo < maxTo) return "Raise must exceed the current bet";
                const minTo = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise;
                const isAllIn = raiseTo >= maxTo;
                if (raiseTo < minTo && !isAllIn) return `Minimum is ${minTo}`;
                const finalTo = Math.min(raiseTo, maxTo);
                const raiseSize = finalTo - this.currentBet;
                this.contribute(idx, finalTo - s.bet);
                if (raiseSize >= this.minRaise) {
                    this.minRaise = raiseSize;
                    // reopen the action for everyone still in
                    for (const j of this.dealtSeats()) {
                        if (j !== idx && !this.seats[j]!.folded && !this.seats[j]!.allIn) this.seats[j]!.acted = false;
                    }
                }
                this.currentBet = Math.max(this.currentBet, finalTo);
                s.acted = true;
                s.lastAction = s.allIn ? "All-in" : this.currentBet === finalTo && raiseSize === finalTo ? "Bet" : "Raise";
                break;
            }
            default:
                return "Unknown action";
        }

        this.advanceAfterAction(idx);
        return null;
    }

    private advanceAfterAction(from: number): void {
        // Last player standing wins immediately.
        const live = this.dealtSeats().filter((i) => !this.seats[i]!.folded);
        if (live.length === 1) return this.endUncontested(live[0]);

        const next = this.nextToAct(from);
        if (next === -1) this.advanceStreet();
        else this.toAct = next;
    }

    private advanceStreet(): void {
        for (const i of this.dealtSeats()) { this.seats[i]!.bet = 0; this.seats[i]!.acted = false; }
        this.currentBet = 0;
        this.minRaise = this.bigBlind;

        if (this.phase === "preflop") { this.phase = "flop"; this.deal(3); }
        else if (this.phase === "flop") { this.phase = "turn"; this.deal(1); }
        else if (this.phase === "turn") { this.phase = "river"; this.deal(1); }
        else { return this.showdown(); }

        const first = this.nextActiveAfter(this.dealer); // SB seat (or next live)
        if (first === -1 || this.countCanAct() < 2) {
            // everyone's all-in (or only one can act) — run the board out
            return this.advanceStreet();
        }
        this.toAct = first;
    }

    private deal(n: number): void {
        for (let i = 0; i < n; i++) this.community.push(this.deck.pop()!);
    }

    /* ----------------------------------------------------------- resolution */

    private endUncontested(winnerIdx: number): void {
        const pot = this.potTotal();
        this.seats[winnerIdx]!.stack += pot;
        this.winners = [{ seat: winnerIdx, amount: pot, handName: "Uncontested" }];
        this.finishHand();
    }

    private showdown(): void {
        this.phase = "showdown";
        const pots = this.buildPots();
        const scores = new Map<number, HandScore>();
        for (const i of this.dealtSeats()) {
            if (!this.seats[i]!.folded) scores.set(i, evaluate7([...this.community, ...this.seats[i]!.cards]));
        }
        const winnings = new Map<number, { amount: number; handName: string }>();
        for (const pot of pots) {
            const contenders = pot.eligible.filter((i) => scores.has(i));
            if (!contenders.length) continue;
            let best = contenders[0];
            for (const i of contenders) if (compareScore(scores.get(i)!, scores.get(best)!) > 0) best = i;
            const winnersOfPot = contenders.filter((i) => compareScore(scores.get(i)!, scores.get(best)!) === 0);
            const share = Math.floor(pot.amount / winnersOfPot.length);
            let remainder = pot.amount - share * winnersOfPot.length;
            for (const i of winnersOfPot) {
                const give = share + (remainder-- > 0 ? 1 : 0);
                this.seats[i]!.stack += give;
                const prev = winnings.get(i);
                winnings.set(i, { amount: (prev?.amount || 0) + give, handName: scores.get(i)!.name });
            }
        }
        this.winners = [...winnings.entries()].map(([seat, w]) => ({ seat, amount: w.amount, handName: w.handName }));
        this.finishHand();
    }

    /** Layered side pots from each player's total contribution this hand. */
    private buildPots(): { amount: number; eligible: number[] }[] {
        let contribs = this.dealtSeats()
            .map((i) => ({ i, amt: this.seats[i]!.committed, folded: this.seats[i]!.folded }))
            .filter((c) => c.amt > 0);
        const pots: { amount: number; eligible: number[] }[] = [];
        while (contribs.length) {
            const min = Math.min(...contribs.map((c) => c.amt));
            let amount = 0;
            for (const c of contribs) { amount += min; c.amt -= min; }
            const eligible = contribs.filter((c) => !c.folded).map((c) => c.i);
            pots.push({ amount, eligible });
            contribs = contribs.filter((c) => c.amt > 0);
        }
        return pots;
    }

    private finishHand(): void {
        this.handActive = false;
        this.toAct = -1;
        this.lastResultAt = Date.now();
        for (const i of this.dealtSeats()) this.seats[i]!.committed = 0;
        // players who busted out sit out until they rebuy / leave
        for (const s of this.seats) if (s && s.stack <= 0) s.sittingOut = true;
    }

    /* ----------------------------------------------------------- navigation */

    private nextSeatInList(list: number[], from: number): number {
        for (let k = 1; k <= MAX_SEATS; k++) {
            const idx = (from + k) % MAX_SEATS;
            if (list.includes(idx)) return idx;
        }
        return from;
    }

    private ringFromDealer(dealt: number[]): number[] {
        const ring: number[] = [];
        for (let k = 0; k < MAX_SEATS; k++) {
            const idx = (this.dealer + k) % MAX_SEATS;
            if (dealt.includes(idx)) ring.push(idx);
        }
        return ring;
    }

    private nextActiveAfter(from: number): number {
        for (let k = 1; k <= MAX_SEATS; k++) {
            const idx = (from + k) % MAX_SEATS;
            const s = this.seats[idx];
            if (s && !s.folded && !s.allIn && s.stack > 0 && !s.sittingOut) return idx;
        }
        return -1;
    }

    private nextToAct(from: number): number {
        for (let k = 1; k <= MAX_SEATS; k++) {
            const idx = (from + k) % MAX_SEATS;
            const s = this.seats[idx];
            if (!s || s.folded || s.allIn || s.sittingOut) continue;
            if (!s.acted || s.bet < this.currentBet) return idx;
        }
        return -1;
    }

    private countCanAct(): number {
        return this.dealtSeats().filter((i) => !this.seats[i]!.folded && !this.seats[i]!.allIn).length;
    }

    potTotal(): number {
        return this.seats.reduce((sum, s) => sum + (s?.committed || 0), 0);
    }

    currentActorId(): string | null {
        return this.toAct >= 0 ? this.seats[this.toAct]?.id ?? null : null;
    }
}
