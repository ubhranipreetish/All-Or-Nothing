/* Shared poker view types — the contract between server (PokerHub.viewFor),
   the local test engine, and the table UI. Keep server + client in sync. */

export interface Card {
    r: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
    s: "s" | "h" | "d" | "c";
}

export interface SeatView {
    seat: number;
    name: string;
    stack: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    away: boolean; // sitting out (won't be dealt)
    disconnected: boolean;
    lastAction?: string;
    isTurn: boolean;
    isYou: boolean;
    isDealer: boolean;
    blind: "SB" | "BB" | null;
    isWinner: boolean;
    hasCards: boolean;
    cards: Card[] | null;
}

export interface Legal {
    toCall: number;
    canCheck: boolean;
    canCall: boolean;
    callAmount: number;
    canRaise: boolean;
    minRaiseTo: number;
    maxRaiseTo: number;
    isBet: boolean;
}

export interface Winner {
    seat: number;
    amount: number;
    handName: string;
}

export interface PendingPlayer {
    id: string;
    name: string;
    buyIn: number;
}

export interface TableState {
    tableId: string;
    phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
    community: Card[];
    pot: number;
    currentBet: number;
    bigBlind: number;
    smallBlind: number;
    startingStack: number;
    dealer: number;
    toAct: number;
    handId: number;
    handActive: boolean;
    winners: Winner[] | null;
    /* turn clock — client counts down from (deadlineTs - serverNow) */
    deadlineTs: number | null;
    serverNow: number;
    turnSeconds: number;
    /* viewer context */
    youId: string;
    youSeated: boolean;
    youAway: boolean;
    youCanRebuy: boolean;
    /* lobby / host context — optional so the local (backend-free) engine,
       which never sets them, still satisfies this type. */
    started?: boolean;
    youHost?: boolean;
    youPending?: boolean;
    youSpectating?: boolean;
    hostName?: string;
    pending?: PendingPlayer[];
    seats: (SeatView | null)[];
    legal: Legal | null;
}
