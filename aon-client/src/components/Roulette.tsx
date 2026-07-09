"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Undo2, Copy } from "lucide-react";
import "../styles/Roulette.css";
import Navbar from "./Navbar";
import Footer from "./Footer";
import HowToPlay from "./HowToPlay";
import GameHeader from "./game/GameHeader";
import { useLeaveGuard } from "./game/LeaveGuard";
import PendingButton from "./game/PendingButton";
import { useWallet } from "../contexts/WalletContext";

/* ───────────────────────── constants ───────────────────────── */
const WHEEL = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEG = 360 / WHEEL.length;

const colorOf = (n: number): "red" | "black" | "green" => (n === 0 ? "green" : RED.has(n) ? "red" : "black");
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const CHIPS = [10, 25, 50, 100, 500];
const chipClass = (v: number) => (v >= 500 ? "c500" : v >= 100 ? "c100" : v >= 50 ? "c50" : v >= 25 ? "c25" : "c10");

interface Bet {
    key: string;
    label: string;
    numbers: number[];
    mult: number;
    amount: number;
    pos?: { left: string; top: string };
}
type Orient = "h" | "v";

/* generic inside-bet spot generator for either felt orientation */
function makeSpots(orient: Orient): Omit<Bet, "amount">[] {
    const COLS = orient === "h" ? 12 : 3;
    const ROWS = orient === "h" ? 3 : 12;
    const cellNum = orient === "h" ? (r: number, c: number) => c * 3 + (3 - r) : (r: number, c: number) => r * 3 + c + 1;
    const x = (l: number) => `${(l / COLS) * 100}%`;
    const y = (l: number) => `${(l / ROWS) * 100}%`;
    const out: Omit<Bet, "amount">[] = [];
    const add = (label: string, nums: number[], left: string, top: string) =>
        out.push({ key: `i${[...nums].sort((a, b) => a - b).join("-")}`, label, numbers: nums, mult: 36 / nums.length, pos: { left, top } });

    // splits between horizontally-adjacent cells (same row)
    for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < ROWS; r++) add("Split", [cellNum(r, c), cellNum(r, c + 1)], x(c + 1), y(r + 0.5));
    // splits between vertically-adjacent cells (same column)
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 1; r++) add("Split", [cellNum(r, c), cellNum(r + 1, c)], x(c + 0.5), y(r + 1));
    for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < ROWS - 1; r++) add("Corner", [cellNum(r, c), cellNum(r, c + 1), cellNum(r + 1, c), cellNum(r + 1, c + 1)], x(c + 1), y(r + 1));
    for (let k = 0; k < 12; k++) {
        const nums = [3 * k + 1, 3 * k + 2, 3 * k + 3];
        if (orient === "h") add("Street", nums, x(k + 0.5), y(ROWS));
        else add("Street", nums, x(COLS), y(k + 0.5));
    }
    for (let k = 0; k < 11; k++) {
        const nums = [3 * k + 1, 3 * k + 2, 3 * k + 3, 3 * k + 4, 3 * k + 5, 3 * k + 6];
        if (orient === "h") add("Six Line", nums, x(k + 1), y(ROWS));
        else add("Six Line", nums, x(COLS), y(k + 1));
    }
    if (orient === "h") {
        add("Split", [0, 1], x(0), y(2.5));
        add("Split", [0, 2], x(0), y(1.5));
        add("Split", [0, 3], x(0), y(0.5));
        add("Basket", [0, 1, 2, 3], x(0), y(3));
    } else {
        add("Split", [0, 1], x(0.5), y(0));
        add("Split", [0, 2], x(1.5), y(0));
        add("Split", [0, 3], x(2.5), y(0));
        add("Basket", [0, 1, 2, 3], x(0), y(0));
    }
    return out;
}

/* ───────────────────────── component ───────────────────────── */
export default function Roulette({ testMode = false }: { testMode?: boolean }) {
    const w = useWallet();
    const [testBal, setTestBal] = useState(5000);
    const wallet = testMode ? testBal : w.wallet;

    /* ---------- server-authoritative wallet bridge ----------
       The real, signed-in path is fully server-driven: startGameSession stakes
       the total, rouletteSpin picks the winning number + prices the bets from
       their KEYS (never client numbers/multipliers) and credits the return.
       testMode keeps a local shim so the practice table still works offline. */
    const beginSession = async (amount: number): Promise<{ success: boolean; sessionId?: string }> => {
        if (testMode) { setTestBal((b) => b - amount); return { success: true, sessionId: "test" }; }
        const r = await w.startGameSession(amount, "ROULETTE", {});
        return { success: r.success, sessionId: r.sessionId };
    };
    /* Settle a round server-side. Returns the winning pocket + the total return
       (already credited to the balance) — or null if the spin was rejected. */
    const settleSpin = async (sessionId: string, activeBets: Bet[]): Promise<{ number: number; won: number } | null> => {
        if (testMode) {
            const num = WHEEL[Math.floor(Math.random() * WHEEL.length)];
            let won = 0;
            for (const b of activeBets) if (b.numbers.includes(num)) won += b.amount * b.mult;
            setTestBal((b) => b + won);
            return { number: num, won };
        }
        return w.rouletteSpin(sessionId, activeBets.map((b) => ({ key: b.key, amount: b.amount })));
    };

    const [bets, setBets] = useState<Bet[]>([]);
    const [history, setHistory] = useState<Bet[][]>([]);
    const [lastRound, setLastRound] = useState<Bet[]>([]);
    const [chip, setChip] = useState(10);
    const [staging, setStaging] = useState(false); // SPIN clicked, bet round-trip in flight
    const [spinning, setSpinning] = useState(false);
    const [winningIndex, setWinningIndex] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [winnings, setWinnings] = useState(0);
    const [recent, setRecent] = useState<number[]>([]);
    const [toast, setToast] = useState("");
    const [banner, setBanner] = useState<{ num: number; delta: number; away?: boolean } | null>(null);
    const [hover, setHover] = useState<number[] | null>(null);

    const wheelRef = useRef<SVGSVGElement>(null);
    const ballRef = useRef<HTMLDivElement>(null);
    const wheelAngle = useRef(0);
    const ballAngle = useRef(0);
    const raf = useRef<number | null>(null);
    const spinSound = useRef<HTMLAudioElement | null>(null);
    const winSound = useRef<HTMLAudioElement | null>(null);
    const audioCtx = useRef<AudioContext | null>(null);
    const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /* the drawn result while a spin is live — written to sessionStorage if the player leaves mid-spin */
    const pendingResult = useRef<{ number: number; color: "red" | "black" | "green"; net: number } | null>(null);
    /* the active session id from SPIN → used to settle in the background if the player leaves before the ball is drawn */
    const sessionIdRef = useRef<string | null>(null);
    /* hosts the shared HowToPlay modal; its own trigger is hidden — GameHeader opens it */
    const howtoHost = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        spinSound.current = new Audio("/sounds/roulette.mp3");
        winSound.current = new Audio("/sounds/win_wheel.mp3");
        return () => {
            if (raf.current) cancelAnimationFrame(raf.current);
            if (bannerTimer.current) clearTimeout(bannerTimer.current);
        };
    }, []);

    /* a spin left rolling on a previous visit — replay its result in the banner slot */
    useEffect(() => {
        let raw: string | null = null;
        try {
            raw = sessionStorage.getItem("rl:awayResult");
            if (raw) sessionStorage.removeItem("rl:awayResult");
        } catch { /* ignore */ }
        if (!raw) return;
        try {
            const r = JSON.parse(raw) as { number: number; net: number };
            if (typeof r.number !== "number" || typeof r.net !== "number") return;
            if (bannerTimer.current) clearTimeout(bannerTimer.current);
            setBanner({ num: r.number, delta: r.net, away: true });
            bannerTimer.current = setTimeout(() => setBanner(null), 4000);
        } catch { /* ignore */ }
    }, []);

    /* leaving mid-spin is safe (the win is credited the moment the result is
       drawn) — the guard is about perception: offer to show the result later */
    useLeaveGuard({
        when: staging || spinning,
        title: "The ball is still rolling",
        message: "Your bets settle on their own — the result will be waiting when you return.",
        actions: [
            { label: "Stay", tone: "ghost", leave: false },
            {
                label: "Leave — settle in background",
                tone: "gold",
                leave: true,
                run: async () => {
                    // If the ball was already drawn, the round is settled server-side
                    // and pendingResult holds it — just leave a note to replay later.
                    let r = pendingResult.current;
                    // Left during staging (before the draw): settle the active session
                    // now so no money is left stuck, then stash the result.
                    if (!r && sessionIdRef.current) {
                        const settled = await settleSpin(sessionIdRef.current, bets);
                        sessionIdRef.current = null;
                        if (settled) {
                            const net = settled.won > 0 ? settled.won : -totalBet;
                            r = { number: settled.number, color: colorOf(settled.number), net };
                        }
                    }
                    if (r) {
                        try { sessionStorage.setItem("rl:awayResult", JSON.stringify(r)); } catch { /* ignore */ }
                    }
                },
            },
        ],
    });

    const spotsH = useMemo(() => makeSpots("h"), []);
    const spotsV = useMemo(() => makeSpots("v"), []);

    const outside = useMemo(() => {
        const evens = range(1, 36).filter((n) => n % 2 === 0);
        const odds = range(1, 36).filter((n) => n % 2 === 1);
        const columns = {
            c1: { key: "c1", label: "2:1", numbers: range(1, 36).filter((n) => n % 3 === 1), mult: 3 },
            c2: { key: "c2", label: "2:1", numbers: range(1, 36).filter((n) => n % 3 === 2), mult: 3 },
            c3: { key: "c3", label: "2:1", numbers: range(1, 36).filter((n) => n % 3 === 0), mult: 3 },
        };
        return {
            columns,
            dozens: [
                { key: "d1", label: "1st 12", numbers: range(1, 12), mult: 3 },
                { key: "d2", label: "2nd 12", numbers: range(13, 24), mult: 3 },
                { key: "d3", label: "3rd 12", numbers: range(25, 36), mult: 3 },
            ],
            evenMoney: [
                { key: "low", label: "1–18", numbers: range(1, 18), mult: 2, cls: "" },
                { key: "even", label: "EVEN", numbers: evens, mult: 2, cls: "" },
                { key: "red", label: "RED", numbers: [...RED], mult: 2, cls: "rl-red" },
                { key: "black", label: "BLACK", numbers: range(1, 36).filter((n) => !RED.has(n)), mult: 2, cls: "rl-black" },
                { key: "odd", label: "ODD", numbers: odds, mult: 2, cls: "" },
                { key: "high", label: "19–36", numbers: range(19, 36), mult: 2, cls: "" },
            ],
        };
    }, []);

    const totalBet = bets.reduce((s, b) => s + b.amount, 0);
    const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };
    const showBanner = (num: number, delta: number) => {
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        setBanner({ num, delta });
        bannerTimer.current = setTimeout(() => setBanner(null), 2500);
    };

    const chipClick = () => {
        try {
            if (typeof window === "undefined") return;
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioCtx.current = audioCtx.current || new AC();
            const c = audioCtx.current;
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = "square";
            o.frequency.value = 320;
            g.gain.value = 0.03;
            o.connect(g);
            g.connect(c.destination);
            const t = c.currentTime;
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
            o.start(t);
            o.stop(t + 0.05);
        } catch { /* ignore */ }
    };

    const place = useCallback(
        (b: Omit<Bet, "amount">) => {
            if (staging || spinning || showResult) return;
            chipClick();
            setHistory((h) => [...h, bets]);
            setBets((prev) => {
                const i = prev.findIndex((x) => x.key === b.key);
                if (i >= 0) {
                    const next = [...prev];
                    next[i] = { ...next[i], amount: next[i].amount + chip };
                    return next;
                }
                return [...prev, { ...b, amount: chip }];
            });
        },
        [staging, spinning, showResult, bets, chip],
    );
    const removeKey = (key: string) => {
        if (staging || spinning || showResult) return;
        setHistory((h) => [...h, bets]);
        setBets((prev) => {
            const i = prev.findIndex((x) => x.key === key);
            if (i < 0) return prev;
            const next = [...prev];
            if (next[i].amount <= chip) next.splice(i, 1);
            else next[i] = { ...next[i], amount: next[i].amount - chip };
            return next;
        });
    };
    const busy = staging || spinning;
    const undo = () => { if (busy || !history.length) return; setBets(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
    const clear = () => { if (busy || !bets.length) return; setHistory((h) => [...h, bets]); setBets([]); };
    const double = () => { if (busy || !bets.length) return; if (totalBet * 2 > wallet) return notify("Not enough balance to double"); setHistory((h) => [...h, bets]); setBets((prev) => prev.map((b) => ({ ...b, amount: b.amount * 2 }))); };
    const rebet = () => { if (busy || !lastRound.length) return; const t = lastRound.reduce((s, b) => s + b.amount, 0); if (t > wallet) return notify("Not enough balance to rebet"); setBets(lastRound); };
    const betOn = (key: string) => bets.find((b) => b.key === key);

    /* ---------- shared bet-spot props ----------
       Click places, right-click removes (pointer devices), long-press ~500ms
       removes (touch). Hover previews covered numbers and shows the payout. */
    const lp = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; suppressClick: boolean }>({ timer: null, fired: false, suppressClick: false });
    const cancelPress = () => { if (lp.current.timer) { clearTimeout(lp.current.timer); lp.current.timer = null; } };
    const bettable = (b: Omit<Bet, "amount">, title?: string) => ({
        title: title ?? `${b.label} · pays ${b.mult - 1}:1`,
        onClick: () => {
            if (lp.current.suppressClick) { lp.current.suppressClick = false; return; }
            place(b);
        },
        onContextMenu: (e: ReactMouseEvent) => {
            e.preventDefault();
            cancelPress();
            const fired = lp.current.fired;
            lp.current.fired = false;
            if (!fired) removeKey(b.key); // long-press already removed on browsers that also fire contextmenu
        },
        onTouchStart: () => {
            lp.current.fired = false;
            lp.current.suppressClick = false;
            lp.current.timer = setTimeout(() => {
                lp.current.timer = null;
                lp.current.fired = true;
                lp.current.suppressClick = true;
                removeKey(b.key);
            }, 500);
        },
        onTouchEnd: cancelPress,
        onTouchMove: cancelPress,
        onMouseEnter: () => setHover(b.numbers),
        onMouseLeave: () => setHover(null),
    });

    /* ---------- spin physics ----------
       The wheel settles at a RANDOM orientation and the ball comes to rest in
       the winning pocket wherever that happens to be on screen (like a real
       roulette wheel — no fixed top pointer). The result is still a fair uniform
       draw; only its on-screen position is random. */
    const runSpin = (resultIndex: number, won: number) => {
        const wheelEl = wheelRef.current;
        const ballEl = ballRef.current;
        if (!wheelEl || !ballEl) return; // player left mid-staging — the round already settled server-side

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const duration = reduce ? 1500 : 10000;

        const wheelStart = wheelAngle.current;
        // 4 turns + a random final orientation → winning pocket can rest anywhere
        const wheelEnd = wheelStart + 360 * 4 + Math.random() * 360;
        const wheelEndMod = ((wheelEnd % 360) + 360) % 360;
        // screen angle (0 = top, clockwise) where the winning pocket comes to rest
        const pocketScreenAngle = (((resultIndex * SEG + SEG / 2 + wheelEndMod) % 360) + 360) % 360;

        // ball counter-rotates ~6 turns and lands exactly in that pocket
        const ballStart = ballAngle.current;
        const base = ballStart - 360 * 6;
        const ballEnd = base - ((((base - pocketScreenAngle) % 360) + 360) % 360);

        const rOuter = 45, rPocket = 37.5;
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const t0 = performance.now();

        const frame = (now: number) => {
            const t = Math.min((now - t0) / duration, 1);
            const e = easeOut(t);
            wheelEl.style.transform = `rotate(${wheelStart + (wheelEnd - wheelStart) * e}deg)`;
            const ba = ballStart + (ballEnd - ballStart) * e;
            // ball rides the outer rim, then spirals into the pocket over the last 45%
            const drop = t < 0.55 ? 0 : Math.min(1, (t - 0.55) / 0.45);
            const bounce = drop > 0.9 ? Math.sin((drop - 0.9) * 28) * (1 - drop) * 2.4 : 0;
            const r = rOuter - (rOuter - rPocket) * drop + bounce;
            const rad = (ba * Math.PI) / 180;
            ballEl.style.left = `${50 + r * Math.sin(rad)}%`;
            ballEl.style.top = `${50 - r * Math.cos(rad)}%`;
            if (t < 1) raf.current = requestAnimationFrame(frame);
            else { wheelAngle.current = wheelEnd; ballAngle.current = ballEnd; settle(resultIndex, won); }
        };
        raf.current = requestAnimationFrame(frame);
    };

    const settle = (resultIndex: number, won: number) => {
        const num = WHEEL[resultIndex];
        if (spinSound.current) spinSound.current.pause();
        // the round is already settled server-side (rouletteSpin credited the
        // return before the ball started rolling) — the animation just reveals it
        setWinningIndex(resultIndex);
        setShowResult(true);
        setSpinning(false);
        setRecent((r) => [num, ...r].slice(0, 14));
        setWinnings(won);
        if (won > 0) winSound.current?.play().catch(() => {});
        showBanner(num, won > 0 ? won : -totalBet);
        pendingResult.current = null; // settled in-session — nothing to replay later
    };

    const spin = async () => {
        if (staging || spinning) return;
        if (!bets.length) return notify("Place at least one bet");
        if (totalBet > wallet) return notify("Insufficient balance");
        setStaging(true); // "NO MORE BETS" — the croupier takes the bets to the server
        const roundBets = bets;

        // 1) stake the exact total — the server deducts it and opens a session
        const started = await beginSession(totalBet);
        if (!started.success || !started.sessionId) {
            setStaging(false);
            return notify("Couldn't place bets — are you signed in?");
        }
        sessionIdRef.current = started.sessionId;
        setLastRound(roundBets);
        setHistory([]);
        setShowResult(false);
        setWinningIndex(null);
        setWinnings(0);
        setBanner(null);

        // 2) the server picks the winning number and prices the bets by key,
        //    crediting the return before the ball ever rolls
        const result = await settleSpin(started.sessionId, roundBets);
        if (!result) {
            // The stake sits in the still-active session — a retry SPIN resumes it.
            setStaging(false);
            return notify("Spin failed — tap SPIN to try again");
        }
        const { number, won } = result;
        // 3) find the on-screen pocket from OUR OWN wheel order so the ball lands
        //    on the right number — never trust the server's index for rendering
        const resultIndex = WHEEL.indexOf(number);
        pendingResult.current = { number, color: colorOf(number), net: won > 0 ? won : -totalBet };
        sessionIdRef.current = null; // settled — nothing left to background-settle

        setSpinning(true);
        setStaging(false); // bets confirmed + settled — the wheel takes over
        if (spinSound.current) { spinSound.current.currentTime = 0; spinSound.current.play().catch(() => {}); }
        runSpin(resultIndex, won);
    };
    const newRound = () => { setShowResult(false); setWinningIndex(null); setWinnings(0); setBanner(null); setBets([]); };
    const highlighted = (n: number) => hover?.includes(n) ?? false;

    /* ---------- felt renderer (shared by both orientations) ---------- */
    const renderFelt = (orient: Orient, spots: Omit<Bet, "amount">[]) => {
        const cols = orient === "h" ? 12 : 3;
        const rows = orient === "h" ? 3 : 12;
        const cellNum = orient === "h" ? (r: number, c: number) => c * 3 + (3 - r) : (r: number, c: number) => r * 3 + c + 1;
        const colOrder = orient === "h" ? [outside.columns.c3, outside.columns.c2, outside.columns.c1] : [outside.columns.c1, outside.columns.c2, outside.columns.c3];
        return (
            <div className={`rl-felt rl-felt--${orient}`}>
                <div className="rl-felt-main">
                    <button className={`rl-zero ${betOn("i0") ? "bet" : ""} ${highlighted(0) ? "hl" : ""}`} {...bettable({ key: "i0", label: "Straight", numbers: [0], mult: 36 })}>
                        0
                        {betOn("i0") && <Chip amount={betOn("i0")!.amount} />}
                    </button>
                    <div className="rl-grid-wrap">
                        <div className="rl-numbers">
                            {Array.from({ length: rows }).flatMap((_, r) =>
                                Array.from({ length: cols }).map((_, c) => {
                                    const n = cellNum(r, c);
                                    const key = `i${n}`; // straight-up = single-pocket inside bet (contract: i<n>)
                                    return (
                                        <button key={n} className={`rl-num ${colorOf(n)} ${betOn(key) ? "bet" : ""} ${highlighted(n) ? "hl" : ""}`} {...bettable({ key, label: "Straight", numbers: [n], mult: 36 })}>
                                            {n}
                                            {betOn(key) && <Chip amount={betOn(key)!.amount} />}
                                        </button>
                                    );
                                }),
                            )}
                        </div>
                        <div className="rl-spots">
                            {spots.map((s) => {
                                const b = betOn(s.key);
                                return (
                                    <button key={`${orient}-${s.key}`} className={`rl-spot ${b ? "bet" : ""}`} style={{ left: s.pos!.left, top: s.pos!.top }} {...bettable(s, `${s.label} (${s.numbers.join(", ")}) · pays ${s.mult - 1}:1`)}>
                                        {b && <Chip amount={b.amount} small />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="rl-cols">
                        {colOrder.map((c) => (
                            <button key={c.key} className={`rl-col ${betOn(c.key) ? "bet" : ""}`} {...bettable(c, "Column · pays 2:1")}>
                                {c.label}
                                {betOn(c.key) && <Chip amount={betOn(c.key)!.amount} small />}
                            </button>
                        ))}
                    </div>
                    <div className="rl-dozens">
                        {outside.dozens.map((d) => (
                            <button key={d.key} className={`rl-dozen ${betOn(d.key) ? "bet" : ""}`} {...bettable(d)}>
                                {d.label}
                                {betOn(d.key) && <Chip amount={betOn(d.key)!.amount} small />}
                            </button>
                        ))}
                    </div>
                    <div className="rl-outside">
                        {outside.evenMoney.map((o) => (
                            <button key={o.key} className={`rl-ev ${o.cls} ${betOn(o.key) ? "bet" : ""}`} {...bettable(o)}>
                                {o.cls === "rl-red" ? <span className="rl-diamond" /> : o.cls === "rl-black" ? <span className="rl-diamond dark" /> : o.label}
                                {betOn(o.key) && <Chip amount={betOn(o.key)!.amount} small />}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    /* ───────────────────────── render ───────────────────────── */
    return (
        <>
            <Navbar />
            <div className="rl-page">
                {testMode && <div className="rl-testbadge">TEST MODE · NO BACKEND · FREE ₹5000 · SPIN FREELY</div>}
                <AnimatePresence>
                    {toast && (
                        <motion.div className="rl-toast" initial={{ opacity: 0, y: -16, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -16, x: "-50%" }}>
                            {toast}
                        </motion.div>
                    )}
                </AnimatePresence>

                <GameHeader
                    eyebrow="EUROPEAN ROULETTE · SINGLE ZERO"
                    title="ROULETTE"
                    tagline="Place your chips. No more bets. Watch the ball decide."
                    onHowToPlay={() => howtoHost.current?.querySelector("button")?.click()}
                />
                {/* shared rules modal — its own trigger is hidden, the header button opens it */}
                <span className="rl-howto-host" ref={howtoHost}><HowToPlay game="roulette" /></span>

                <div className="rl-stat-row">
                    <div className="rl-stat"><span>Balance</span><b>₹{wallet.toFixed(2)}</b></div>
                    <div className="rl-stat"><span>Total Bet</span><b>₹{totalBet}</b></div>
                    <div className="rl-stat"><span>Last Win</span><b className={winnings > 0 ? "win" : ""}>₹{winnings.toFixed(2)}</b></div>
                </div>

                {recent.length > 0 && (
                    <div className="rl-recent">
                        {recent.map((n, i) => <span key={i} className={`rl-recent__n ${colorOf(n)}`}>{n}</span>)}
                    </div>
                )}

                {/* anchored result banner — the slot's height is reserved so the page never shifts */}
                <div className="rl-banner-slot" aria-live="polite">
                    <AnimatePresence>
                        {banner && (
                            <motion.div key={`${banner.num}-${banner.delta}`} className={`rl-banner ${colorOf(banner.num)}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
                                {banner.away && <span className="rl-banner__away">While you were away:</span>}
                                <span className="rl-banner__n">{banner.num}</span>
                                <span className="rl-banner__c">{colorOf(banner.num)}</span>
                                <span className={`rl-banner__amt ${banner.delta > 0 ? "up" : "down"}`}>
                                    {banner.delta > 0 ? `+₹${banner.delta.toFixed(2)}` : `-₹${Math.abs(banner.delta).toFixed(2)}`}
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className={`rl-stage ${staging ? "is-staging" : ""}`}>
                    {/* WHEEL */}
                    <div className="rl-wheelwrap">
                        <div className="rl-wheel">
                            <svg viewBox="0 0 400 400" className="rl-wheel-svg" ref={wheelRef}>
                                <defs>
                                    <radialGradient id="rlHub" cx="50%" cy="45%" r="60%">
                                        <stop offset="0%" stopColor="#241b31" />
                                        <stop offset="100%" stopColor="#0b0910" />
                                    </radialGradient>
                                    <linearGradient id="rlGold" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#ffe79a" />
                                        <stop offset="50%" stopColor="#c8901f" />
                                        <stop offset="100%" stopColor="#ffd877" />
                                    </linearGradient>
                                </defs>
                                <circle cx="200" cy="200" r="198" fill="#07060a" stroke="url(#rlGold)" strokeWidth="5" />
                                {WHEEL.map((num, i) => {
                                    const a = i * SEG;
                                    const mid = a + SEG / 2;
                                    const fill = num === 0 ? "#0e8560" : RED.has(num) ? "#d2372c" : "#120e1a";
                                    const tr = 168;
                                    const tx = Math.round((200 + tr * Math.cos(((mid - 90) * Math.PI) / 180)) * 100) / 100;
                                    const ty = Math.round((200 + tr * Math.sin(((mid - 90) * Math.PI) / 180)) * 100) / 100;
                                    const win = winningIndex === i && showResult;
                                    return (
                                        <g key={num}>
                                            <path d={arc(200, 200, 190, a, a + SEG)} fill={fill} stroke="#d4af37" strokeWidth="0.6" className={win ? "rl-win-seg" : ""} />
                                            <text x={tx} y={ty} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${Math.round(mid * 100) / 100}, ${tx}, ${ty})`} style={{ textShadow: "0 1px 2px #000" }}>{num}</text>
                                        </g>
                                    );
                                })}
                                <circle cx="200" cy="200" r="120" fill="url(#rlHub)" stroke="url(#rlGold)" strokeWidth="3" />
                                <circle cx="200" cy="200" r="64" fill="#0b0910" stroke="url(#rlGold)" strokeWidth="2" />
                                {[0, 60, 120, 180, 240, 300].map((d) => {
                                    const sx = Math.round((200 + 118 * Math.cos((d * Math.PI) / 180)) * 100) / 100;
                                    const sy = Math.round((200 + 118 * Math.sin((d * Math.PI) / 180)) * 100) / 100;
                                    return <line key={d} x1="200" y1="200" x2={sx} y2={sy} stroke="url(#rlGold)" strokeWidth="3" opacity="0.5" />;
                                })}
                                <circle cx="200" cy="200" r="20" fill="url(#rlGold)" />
                            </svg>
                            <div className="rl-ball" ref={ballRef} />
                        </div>
                    </div>

                    {/* TABLE — both orientations rendered, CSS shows the right one */}
                    <div className="rl-tablewrap">
                        {renderFelt("h", spotsH)}
                        {renderFelt("v", spotsV)}

                        <div className="rl-controls">
                            <div className="rl-chips">
                                {CHIPS.map((v) => (
                                    <button key={v} className={`rl-chipbtn ${chipClass(v)} ${chip === v ? "active" : ""}`} onClick={() => setChip(v)}>{v}</button>
                                ))}
                            </div>
                            <div className="rl-actions">
                                <button className="rl-act" onClick={undo} disabled={busy || !history.length} title="Undo"><Undo2 size={18} /></button>
                                <button className="rl-act" onClick={double} disabled={busy || !bets.length} title="Double">2×</button>
                                <button className="rl-act" onClick={rebet} disabled={busy || !lastRound.length} title="Rebet"><Copy size={18} /></button>
                                <button className="rl-act" onClick={clear} disabled={busy || !bets.length} title="Clear"><RotateCcw size={18} /></button>
                            </div>
                        </div>
                    </div>

                    {staging && <p className="staging-note">The croupier takes your bets…</p>}
                </div>

                <div className="rl-footer">
                    <div className="rl-footer__info"><span>Total ₹{totalBet}</span></div>
                    {showResult ? (
                        <button className="rl-spin" onClick={newRound}>NEW ROUND</button>
                    ) : (
                        <PendingButton className="rl-spin" pending={staging} pendingLabel="NO MORE BETS" onClick={spin} disabled={spinning || !bets.length}>
                            {spinning ? "NO MORE BETS" : "SPIN"}
                        </PendingButton>
                    )}
                </div>

                <p className="rl-tip">
                    Tap a chip value, then tap the table to bet •{" "}
                    <span className="rl-tip--fine">Right-click a spot to remove</span>
                    <span className="rl-tip--coarse">Long-press a spot to remove</span>
                    {" "}• Inside lines = splits, corners, streets &amp; six-lines
                </p>
            </div>
            <Footer />
        </>
    );
}

function Chip({ amount, small }: { amount: number; small?: boolean }) {
    return (
        <span className={`rl-chip ${chipClass(amount >= 500 ? 500 : amount)} ${small ? "sm" : ""}`}>
            {amount >= 1000 ? `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k` : amount}
        </span>
    );
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p0 = polar(cx, cy, r, a1);
    const p1 = polar(cx, cy, r, a0);
    const large = a1 - a0 <= 180 ? "0" : "1";
    return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 0 ${p1.x} ${p1.y} Z`;
}
function polar(cx: number, cy: number, r: number, deg: number) {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: Math.round((cx + r * Math.cos(a)) * 100) / 100, y: Math.round((cy + r * Math.sin(a)) * 100) / 100 };
}
