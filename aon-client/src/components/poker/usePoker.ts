"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

/* Types mirror the server's per-viewer snapshot (PokerHub.viewFor). */
export interface Card {
    r: number;
    s: "s" | "h" | "d" | "c";
}
export interface SeatView {
    seat: number;
    name: string;
    stack: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    sittingOut: boolean;
    connected: boolean;
    lastAction?: string;
    isTurn: boolean;
    isYou: boolean;
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
export interface TableState {
    tableId: string;
    phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
    community: Card[];
    pot: number;
    currentBet: number;
    bigBlind: number;
    smallBlind: number;
    dealer: number;
    toAct: number;
    handId: number;
    handActive: boolean;
    winners: { seat: number; amount: number; handName: string }[] | null;
    turnSeconds: number;
    youId: string;
    seats: (SeatView | null)[];
    legal: Legal | null;
}

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "");

export function usePoker(name: string) {
    const [state, setState] = useState<TableState | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = io(`${SOCKET_URL}/poker`, {
            auth: { name },
            transports: ["websocket", "polling"],
        });
        socketRef.current = socket;

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("poker:state", (s: TableState) => setState(s));
        socket.on("poker:error", (e: { message: string }) => {
            setError(e.message);
            setTimeout(() => setError(null), 3000);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
        // name is fixed for the lifetime of a room session
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const quickJoin = useCallback(() => {
        socketRef.current?.emit("table:quickJoin", (r: { error?: string }) => {
            if (r?.error) setError(r.error);
        });
    }, []);

    const joinTable = useCallback((code: string) => {
        socketRef.current?.emit("table:join", { tableId: code }, (r: { error?: string }) => {
            if (r?.error) setError(r.error);
        });
    }, []);

    const leave = useCallback(() => {
        socketRef.current?.emit("table:leave");
        setState(null);
    }, []);

    const act = useCallback((type: string, amount = 0) => {
        socketRef.current?.emit("action", { type, amount });
    }, []);

    return { state, connected, error, quickJoin, joinTable, leave, act };
}
