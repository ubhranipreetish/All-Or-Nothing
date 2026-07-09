"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { TableState } from "./types";

export type { Card, SeatView, Legal, TableState } from "./types";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "");

function guestId(): string {
    if (typeof window === "undefined") return "ssr";
    let id = localStorage.getItem("aon_poker_pid");
    if (!id) {
        id = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("aon_poker_pid", id);
    }
    return id;
}

export type JoinStatus = "none" | "pending" | "admitted" | "denied";

export function usePoker(name: string, opts?: { playerId?: string; token?: string }) {
    const [state, setState] = useState<TableState | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [joinStatus, setJoinStatus] = useState<JoinStatus>("none");
    const [admittedBuyIn, setAdmittedBuyIn] = useState<number | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = io(`${SOCKET_URL}/poker`, {
            auth: { name, playerId: opts?.playerId || guestId(), token: opts?.token },
            transports: ["websocket", "polling"],
        });
        socketRef.current = socket;

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("poker:state", (s: TableState) => setState(s));
        socket.on("poker:admitted", (p: { buyIn?: number }) => {
            setAdmittedBuyIn(p?.buyIn ?? null);
            setJoinStatus("admitted");
        });
        socket.on("poker:denied", () => {
            setState(null);
            setJoinStatus("denied");
        });
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

    // seatToken is minted by the authenticated HTTP buy-in and rides along on the
    // create/join emit so the server can tie this seat to its GameSession. The
    // socket never moves money — it only carries this token.
    const createRoom = useCallback((buyIn: number, seatToken?: string, cb?: (code: string | null) => void) => {
        socketRef.current?.emit("table:create", { buyIn, seatToken }, (r: { error?: string; tableId?: string }) => {
            if (r?.error) { setError(r.error); cb?.(null); }
            else cb?.(r?.tableId ?? null);
        });
    }, []);
    /** Look up a room's lobby info before requesting to join. */
    const peek = useCallback(
        (code: string, cb?: (r: { exists: boolean; hostName?: string; started?: boolean; seatsTaken?: number; maxSeats?: number }) => void) => {
            socketRef.current?.emit("table:peek", { tableId: code }, (r: { exists: boolean; hostName?: string }) => cb?.(r));
        },
        [],
    );
    /** Ask the host for a seat → parks us in the approval queue. */
    const requestJoin = useCallback((code: string, buyIn: number, seatToken?: string, cb?: (r: { ok: boolean; hostName?: string }) => void) => {
        socketRef.current?.emit("table:join", { tableId: code, buyIn, seatToken }, (r: { error?: string; hostName?: string }) => {
            if (r?.error) { setError(r.error); cb?.({ ok: false }); }
            else { setJoinStatus("pending"); cb?.({ ok: true, hostName: r?.hostName }); }
        });
    }, []);
    const quickJoin = useCallback((buyIn: number) => {
        socketRef.current?.emit("table:quickJoin", { buyIn }, (r: { error?: string }) => {
            if (r?.error) setError(r.error);
        });
    }, []);

    /* host controls */
    const admit = useCallback((id: string) => socketRef.current?.emit("table:admit", { targetId: id }), []);
    const deny = useCallback((id: string) => socketRef.current?.emit("table:deny", { targetId: id }), []);
    const startGame = useCallback(() => socketRef.current?.emit("table:start"), []);
    const cancelWait = useCallback(() => {
        socketRef.current?.emit("table:cancelWait");
        setJoinStatus("none");
    }, []);
    const resetJoin = useCallback(() => { setJoinStatus("none"); setAdmittedBuyIn(null); }, []);

    const leave = useCallback(() => {
        socketRef.current?.emit("table:leave");
        setState(null);
        setJoinStatus("none");
    }, []);
    const act = useCallback((type: string, amount = 0) => {
        socketRef.current?.emit("action", { type, amount });
    }, []);
    const sitOut = useCallback(() => socketRef.current?.emit("sitOut"), []);
    const sitIn = useCallback(() => socketRef.current?.emit("sitIn"), []);
    const rebuy = useCallback(() => socketRef.current?.emit("rebuy"), []);

    return {
        state, connected, error, joinStatus, admittedBuyIn,
        createRoom, peek, requestJoin, quickJoin,
        admit, deny, startGame, cancelWait, resetJoin,
        leave, act, sitOut, sitIn, rebuy,
    };
}
