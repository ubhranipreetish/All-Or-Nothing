"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocalTable, botAction, ActionType } from "./engine";
import type { TableState } from "./types";

const BOT_NAMES = ["Vega", "Nova", "Rex", "Mara", "Zane"];
const TURN_SECONDS = 20;

/**
 * Drives a LocalTable entirely in the browser — no socket, no server. Seats
 * "you" plus N bots, runs the turn loop on timers (with a real countdown +
 * timeout penalty on your turn), and exposes the same surface the live hook
 * does, so <PokerTable/> is reused unchanged. For eyeballing UI + gameplay.
 */
export function useLocalPoker(you: string, bots: number) {
    const [state, setState] = useState<TableState | null>(null);
    const tableRef = useRef<LocalTable | null>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const youTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(true);

    const clearAll = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        if (youTimer.current) clearTimeout(youTimer.current);
        youTimer.current = null;
    };
    const schedule = (fn: () => void, ms: number) => {
        const t = setTimeout(() => mounted.current && fn(), ms);
        timers.current.push(t);
    };

    const emit = useCallback(() => {
        if (tableRef.current) setState(tableRef.current.view("you"));
    }, []);

    const drive = useCallback(() => {
        const t = tableRef.current;
        if (!t) return;
        if (youTimer.current) { clearTimeout(youTimer.current); youTimer.current = null; }

        if (!t.handActive) {
            emit();
            if (t.occupied().length >= 2) schedule(() => { t.maybeStartHand(); drive(); }, 3500);
            return;
        }
        const actor = t.currentActorId();
        if (!actor) { emit(); return; }
        t.deadlineTs = Date.now() + TURN_SECONDS * 1000;
        emit();

        if (actor === "you") {
            youTimer.current = setTimeout(() => {
                if (!mounted.current) return;
                t.timeoutCurrent();
                drive();
            }, TURN_SECONDS * 1000);
            return;
        }
        schedule(() => {
            if (t.currentActorId() !== actor) return;
            const a = botAction(t);
            const err = t.act(actor, a.type, a.amount);
            if (err) {
                const seat = t.seats[t.toAct]!;
                t.act(actor, t.currentBet - seat.bet <= 0 ? "check" : "fold");
            }
            drive();
        }, 700 + Math.random() * 700);
    }, [emit]);

    const init = useCallback(() => {
        clearAll();
        const t = new LocalTable("TEST");
        t.seat("you", you || "You");
        for (let i = 0; i < bots; i++) t.seat(`bot${i}`, BOT_NAMES[i % BOT_NAMES.length]);
        tableRef.current = t;
        t.maybeStartHand();
        drive();
    }, [you, bots, drive]);

    useEffect(() => {
        mounted.current = true;
        init();
        return () => {
            mounted.current = false;
            clearAll();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const act = useCallback(
        (type: string, amount = 0) => {
            tableRef.current?.act("you", type as ActionType, amount);
            drive();
        },
        [drive],
    );
    const sitOut = useCallback(() => { tableRef.current?.sitOut("you"); drive(); }, [drive]);
    const sitIn = useCallback(() => { tableRef.current?.sitIn("you"); drive(); }, [drive]);
    const rebuy = useCallback(() => { tableRef.current?.rebuy("you"); drive(); }, [drive]);
    const newTable = useCallback(() => init(), [init]);

    return { state, act, sitOut, sitIn, rebuy, newTable };
}
