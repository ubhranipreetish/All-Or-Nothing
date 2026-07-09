"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/* ====================================================================
   LeaveGuard — site-wide navigation guard for live bets.
   Mount <LeaveGuardProvider> once (layout.tsx); games arm a guard with
   useLeaveGuard({...}). While armed it intercepts internal link clicks
   and browser Back with a styled dialog, and arms the native
   beforeunload prompt for tab close / reload. Dialog styles: `.lg-`
   in Game.css. Full usage examples: GAME_CHROME.md.
   ==================================================================== */

export interface LeaveGuardAction {
    label: string;
    /** Button styling: gold = affirmative, ember = destructive, ghost = neutral (default). */
    tone?: "gold" | "ember" | "ghost";
    /** Optional async work (forfeit / settle / refund) run before the dialog resolves. */
    run?: () => Promise<void> | void;
    /** true → after run() resolves, navigation proceeds. false → dialog closes, player stays. */
    leave: boolean;
}

export interface LeaveGuardOptions {
    /** Arm the guard while true (i.e. while a round / bet is live). */
    when: boolean;
    title: string;
    message: string;
    actions: LeaveGuardAction[];
}

type LeaveIntent = { type: "link"; href: string } | { type: "back" };

interface GuardEntry {
    id: string;
    read: () => LeaveGuardOptions;
}

interface PromptState {
    options: LeaveGuardOptions;
    intent: LeaveIntent;
}

interface LeaveGuardContextValue {
    register: (entry: GuardEntry) => void;
    unregister: (id: string) => void;
}

const LeaveGuardContext = createContext<LeaveGuardContextValue | null>(null);

/**
 * Arm/disarm a leave guard from a game component. Only one guard is
 * active at a time — the last one registered wins; it disarms when
 * `options.when` goes false or the component unmounts.
 */
export function useLeaveGuard(options: LeaveGuardOptions): void {
    const ctx = useContext(LeaveGuardContext);
    if (!ctx) throw new Error("useLeaveGuard must be used within a LeaveGuardProvider");

    const id = useId();
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const { register, unregister } = ctx;
    const armed = options.when;

    useEffect(() => {
        if (!armed) return;
        register({ id, read: () => optionsRef.current });
        return () => unregister(id);
    }, [armed, id, register, unregister]);
}

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [guards, setGuards] = useState<GuardEntry[]>([]);
    const [prompt, setPrompt] = useState<PromptState | null>(null);
    const [busy, setBusy] = useState<number | null>(null);

    // Refs so the document/window listeners always see current state.
    const activeRef = useRef<GuardEntry | null>(null);
    const promptOpenRef = useRef(false);
    const busyRef = useRef(false);
    const leavingRef = useRef(false); // a confirmed leave is navigating — stand down

    const armed = guards.length > 0;
    activeRef.current = armed ? guards[guards.length - 1] : null;
    promptOpenRef.current = prompt !== null;

    const register = useCallback((entry: GuardEntry) => {
        setGuards((prev) => [...prev.filter((g) => g.id !== entry.id), entry]);
    }, []);

    const unregister = useCallback((id: string) => {
        setGuards((prev) => prev.filter((g) => g.id !== id));
    }, []);

    // Guard fully disarmed (round settled) → drop any stale dialog,
    // unless an action is still running (it closes the dialog itself).
    useEffect(() => {
        if (!armed && !busyRef.current) setPrompt(null);
    }, [armed]);

    // --- internal link clicks (capture phase, whole document) ---
    useEffect(() => {
        const onClickCapture = (e: MouseEvent) => {
            if (!activeRef.current || leavingRef.current) return;
            if (e.defaultPrevented) return;
            // Respect modified clicks / middle clicks — the browser handles those.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href^="/"]') : null;
            if (!anchor) return;
            if (anchor.target && anchor.target !== "_self") return;
            if (anchor.hasAttribute("download")) return;
            const href = anchor.getAttribute("href");
            if (!href) return;

            e.preventDefault();
            e.stopPropagation();
            if (promptOpenRef.current || busyRef.current) return;
            setPrompt({ options: activeRef.current.read(), intent: { type: "link", href } });
        };
        document.addEventListener("click", onClickCapture, true);
        return () => document.removeEventListener("click", onClickCapture, true);
    }, []);

    // --- browser Back (sentinel history entry + popstate) ---
    useEffect(() => {
        if (!armed) return;
        leavingRef.current = false;
        window.history.pushState({ __leaveGuard: true }, "");

        const onPopState = () => {
            if (!activeRef.current || leavingRef.current) return;
            // Re-arm the sentinel so the next Back press is also caught.
            window.history.pushState({ __leaveGuard: true }, "");
            if (!promptOpenRef.current && !busyRef.current) {
                setPrompt({ options: activeRef.current.read(), intent: { type: "back" } });
            }
        };
        window.addEventListener("popstate", onPopState);
        return () => {
            window.removeEventListener("popstate", onPopState);
            // Round settled in place → pop the sentinel so Back isn't a dead press.
            if (!leavingRef.current) window.history.back();
        };
    }, [armed]);

    // --- tab close / reload: native prompt only (no async work possible) ---
    useEffect(() => {
        if (!armed) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (leavingRef.current) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [armed]);

    // --- Escape closes the dialog (= stay) ---
    useEffect(() => {
        if (!prompt) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busyRef.current) setPrompt(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [prompt]);

    const handleAction = useCallback(
        async (action: LeaveGuardAction, index: number) => {
            if (busyRef.current || !prompt) return;
            busyRef.current = true;
            setBusy(index);
            try {
                await action.run?.();
            } catch (err) {
                console.error("LeaveGuard action failed:", err);
                if (action.leave) {
                    // Never navigate away from live money on a failed settle — stay put.
                    busyRef.current = false;
                    setBusy(null);
                    return;
                }
            }
            busyRef.current = false;
            setBusy(null);
            setPrompt(null);
            if (action.leave) {
                leavingRef.current = true;
                if (prompt.intent.type === "link") router.push(prompt.intent.href);
                else router.push("/"); // Back intent: simple + robust — route home.
            }
        },
        [prompt, router]
    );

    const contextValue = useMemo(() => ({ register, unregister }), [register, unregister]);

    return (
        <LeaveGuardContext.Provider value={contextValue}>
            {children}
            {prompt && (
                <LeaveGuardDialog
                    options={prompt.options}
                    busy={busy}
                    onAction={handleAction}
                    onDismiss={() => {
                        if (!busyRef.current) setPrompt(null);
                    }}
                />
            )}
        </LeaveGuardContext.Provider>
    );
}

function LeaveGuardDialog({
    options,
    busy,
    onAction,
    onDismiss,
}: {
    options: LeaveGuardOptions;
    busy: number | null;
    onAction: (action: LeaveGuardAction, index: number) => void;
    onDismiss: () => void;
}) {
    const titleId = useId();
    const messageId = useId();

    return (
        <div className="lg-overlay" onClick={onDismiss}>
            <div
                className="lg-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="lg-title" id={titleId}>{options.title}</h2>
                <p className="lg-message" id={messageId}>{options.message}</p>
                <div className="lg-actions">
                    {options.actions.map((action, i) => (
                        <button
                            key={i}
                            type="button"
                            className={`lg-btn lg-btn--${action.tone ?? "ghost"}${busy === i ? " is-busy" : ""}`}
                            disabled={busy !== null}
                            onClick={() => onAction(action, i)}
                        >
                            {busy === i && <span className="gp-spinner" aria-hidden="true" />}
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
