"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { TableState } from "./types";

export type { Card, SeatView, Legal, TableState } from "./types";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "");

/** A stable per-browser id so a refresh reconnects to the same seat. */
function getPlayerId(): string {
    if (typeof window === "undefined") return "ssr";
    let id = localStorage.getItem("aon_poker_pid");
    if (!id) {
        id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("aon_poker_pid", id);
    }
    return id;
}

export function usePoker(name: string) {
    const [state, setState] = useState<TableState | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = io(`${SOCKET_URL}/poker`, {
            auth: { name, playerId: getPlayerId() },
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

    const sitOut = useCallback(() => socketRef.current?.emit("sitOut"), []);
    const sitIn = useCallback(() => socketRef.current?.emit("sitIn"), []);
    const rebuy = useCallback(() => socketRef.current?.emit("rebuy"), []);

    return { state, connected, error, quickJoin, joinTable, leave, act, sitOut, sitIn, rebuy };
}
