"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The backend sleeps on Render's free tier, so the first API call after idle
 * can hang for 30–60s with no explanation. On first mount per session, ping
 * /health to wake it. If the server doesn't answer within ~2.5s, show a small
 * bottom-center toast explaining the wait, then flash a short success note
 * once it responds. A failed ping is retried once after 5s.
 */

type Phase = "idle" | "waking" | "awake";

const SESSION_KEY = "aon-server-awake";
const SLOW_AFTER_MS = 2500;
const RETRY_AFTER_MS = 5000;
const SUCCESS_FLASH_MS = 2200;

export default function ServerWakeup() {
    const [phase, setPhase] = useState<Phase>("idle");
    // Tracks whether the "waking" toast actually appeared, so a fast response
    // dismisses silently instead of flashing "awake" out of nowhere.
    const shownRef = useRef(false);

    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_API_URL;
        if (!base) return;
        if (sessionStorage.getItem(SESSION_KEY)) return;

        let cancelled = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const after = (ms: number, fn: () => void) => {
            const t = setTimeout(() => { if (!cancelled) fn(); }, ms);
            timers.push(t);
        };

        const settle = (ok: boolean) => {
            if (cancelled || settled) return;
            settled = true;
            sessionStorage.setItem(SESSION_KEY, "1");
            if (ok && shownRef.current) {
                setPhase("awake");
                after(SUCCESS_FLASH_MS, () => setPhase("idle"));
            } else {
                setPhase("idle");
            }
        };

        const ping = (attempt: number) => {
            fetch(`${base}/health`, { cache: "no-store" })
                .then(() => settle(true))
                .catch(() => {
                    if (cancelled) return;
                    if (attempt === 0) {
                        after(RETRY_AFTER_MS, () => ping(1));
                    } else {
                        settle(false);
                    }
                });
        };

        // If the house hasn't answered shortly, explain the wait.
        after(SLOW_AFTER_MS, () => {
            if (settled) return;
            shownRef.current = true;
            setPhase("waking");
        });
        ping(0);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    }, []);

    if (phase === "idle") return null;

    return (
        <div className={`wakeup-toast ${phase === "awake" ? "wakeup-toast--awake" : ""}`} role="status" aria-live="polite">
            {phase === "waking" ? (
                <>
                    <span className="wakeup-toast__spin" aria-hidden />
                    <span>Waking the house… first hand can take up to a minute.</span>
                </>
            ) : (
                <span>The house is awake.</span>
            )}
        </div>
    );
}
