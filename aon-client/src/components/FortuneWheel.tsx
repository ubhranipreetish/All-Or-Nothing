"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useWallet, type SpinResult } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import "../styles/FortuneWheel.css";
import Navbar from "./Navbar";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
import GameHeader from "./game/GameHeader";
import PendingButton from "./game/PendingButton";
import { useLeaveGuard } from "./game/LeaveGuard";
import CountUp from "./landing/CountUp";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

type DifficultyLevel = "low" | "medium" | "hard";

interface Segment {
    label: string;
    color: string;
}

interface AwayResult {
    mult: number;
    amount: number;
    win: boolean;
}

const MIN_BET = 1;
const AWAY_RESULT_KEY = "fw:awayResult";

const WHEEL_RULES = [
    "Set your bet, risk level and number of segments.",
    "Spin the wheel and watch where the pointer lands.",
    "Your payout is bet × the multiplier you land on.",
    "Landing on 0.00× means you lose the bet.",
];

const FortuneWheel = () => {
    const { wallet, startGameSession, wheelSpin } = useWallet();
    const { user } = useAuth();
    const [showSignInDialog, setShowSignInDialog] = useState(false);
    const [showRules, setShowRules] = useState(false);

    const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
    const [segmentCount, setSegmentCount] = useState<number>(20);
    const [amount, setAmount] = useState<number>(100);
    const [earnings, setEarnings] = useState<number>(0);
    const [earningsDisplay, setEarningsDisplay] = useState<boolean>(false);
    const [started, setStarted] = useState<boolean>(false);
    const [rotation, setRotation] = useState<number>(0);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [result, setResult] = useState<string | null>(null);
    const [notification, setNotification] = useState<string>("");
    const [winningIndex, setWinningIndex] = useState<number | null>(null);
    const [anticipating, setAnticipating] = useState<boolean>(false);
    const [staked, setStaked] = useState<number>(0);
    const [unsettled, setUnsettled] = useState<boolean>(false);
    const [awayResult, setAwayResult] = useState<AwayResult | null>(null);

    const winSound = useRef<HTMLAudioElement | null>(null);
    const spinSound = useRef<HTMLAudioElement | null>(null);
    const wheelRef = useRef<SVGSVGElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    // The server owns the outcome. We hold the live session id and the in-flight
    // spin promise so the leave guard can settle the SAME server call if the
    // player walks away between placing the wager and the spin resolving.
    const sessionIdRef = useRef<string | null>(null);
    const spinPromiseRef = useRef<Promise<SpinResult | null> | null>(null);

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    const segment_structure: Record<"low" | "medium", string[]> = {
        low: ["0.00x", "1.20x", "1.20x", "1.20x", "1.50x", "0.00x", "1.20x", "1.20x", "1.20x", "1.20x"],
        medium: ["0.00x", "1.50x", "0.00x", "2.00x", "0.00x", "1.50x", "0.00x", "3.00x", "0.00x", "1.50x"],
    };
    const multi_divs: Record<"low" | "medium", string[]> = {
        low: ["0.00x", "1.20x", "1.50x"],
        medium: ["0.00x", "1.50x", "2.00x", "3.00x"],
    };
    const difficulties: Record<DifficultyLevel, number> = { low: 4, medium: 3, hard: 2 };

    // Segment palette — harmonized to the Fortune's Edge tokens
    // (void / jade / violet / gold / ember) instead of saturated rainbow.
    const multiplierColors: Record<string, string> = {
        "0.00x": "#241C30",
        "1.20x": "#2BD4A0",
        "1.50x": "#8B5CF6",
        "2.00x": "#E9B949",
        "3.00x": "#FFD877",
        "9.50x": "#FF4438",
        "19.50x": "#A78BFA",
        "29.50x": "#FFD877",
        "39.50x": "#E9B949",
    };

    const no_of_segments = [10, 20, 30, 40];
    const strokeWidth = 26;
    const radius = 250;

    useEffect(() => {
        winSound.current = new Audio("/sounds/win_wheel.mp3");
        spinSound.current = new Audio("/sounds/spin.mp3");
        winSound.current.preload = "auto";
        spinSound.current.preload = "auto";
        const unlockAudio = () => {
            winSound.current?.load();
            spinSound.current?.load();
            window.removeEventListener("touchstart", unlockAudio);
        };
        window.addEventListener("touchstart", unlockAudio, { once: true });
    }, []);

    // A spin settled in the background last visit? Surface it once, then clear.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(AWAY_RESULT_KEY);
            if (raw) {
                sessionStorage.removeItem(AWAY_RESULT_KEY);
                setAwayResult(JSON.parse(raw) as AwayResult);
            }
        } catch {
            /* corrupt/blocked storage — nothing to show */
        }
    }, []);

    // Leave guard — armed only between a confirmed wager (startGameSession) and
    // the spin resolving. A spin is a single atomic server call, so leaving just
    // awaits that same call server-side, parks the result, and walks away.
    useLeaveGuard({
        when: unsettled,
        title: "Spin in flight",
        message: "Your spin settles on its own — the result will be waiting when you return.",
        actions: [
            { label: "Stay", tone: "ghost", leave: false },
            {
                label: "Leave — settle in background",
                tone: "gold",
                leave: true,
                run: async () => {
                    const sid = sessionIdRef.current;
                    if (!sid) return;
                    // Reuse the in-flight spin if there is one; otherwise settle the
                    // session now. Either way the server credits exactly once.
                    const res = await (spinPromiseRef.current ?? wheelSpin(sid)).catch(() => null);
                    if (res) {
                        sessionStorage.setItem(
                            AWAY_RESULT_KEY,
                            JSON.stringify({
                                mult: res.multiplier,
                                amount: res.payout > 0 ? res.payout : staked,
                                win: res.payout > 0,
                            } satisfies AwayResult)
                        );
                    }
                    sessionIdRef.current = null;
                    spinPromiseRef.current = null;
                    setUnsettled(false);
                },
            },
        ],
    });

    const generateSegments = (diff: DifficultyLevel, count: number): Segment[] => {
        const segs: Segment[] = [];
        if (diff === "hard") {
            const jackpot = `${(count - 0.5).toFixed(2)}x`;
            segs.push({ label: jackpot, color: multiplierColors[jackpot] || "#FF4438" });
            for (let i = 1; i < count; i++) segs.push({ label: "0.00x", color: multiplierColors["0.00x"] });
        } else {
            const times = Math.floor(count / 10);
            for (let i = 0; i < times; i++) {
                for (let j = 0; j < 10; j++) {
                    const label = segment_structure[diff][j];
                    segs.push({ label, color: multiplierColors[label] || "#ccc" });
                }
            }
        }
        return segs;
    };

    const createSegments = () => {
        const paths: React.ReactElement[] = [];
        const anglePerSegment = (2 * Math.PI) / segments.length;
        for (let i = 0; i < segments.length; i++) {
            const startAngle = i * anglePerSegment - Math.PI / 2 - Math.PI / segments.length;
            const endAngle = startAngle + anglePerSegment;
            const x1 = radius + radius * Math.cos(startAngle);
            const y1 = radius + radius * Math.sin(startAngle);
            const x2 = radius + radius * Math.cos(endAngle);
            const y2 = radius + radius * Math.sin(endAngle);
            const path = `
        M ${radius + (radius - strokeWidth) * Math.cos(startAngle)} ${radius + (radius - strokeWidth) * Math.sin(startAngle)}
        A ${radius - strokeWidth} ${radius - strokeWidth} 0 0 1 ${radius + (radius - strokeWidth) * Math.cos(endAngle)} ${radius + (radius - strokeWidth) * Math.sin(endAngle)}
        L ${x2} ${y2}
        A ${radius} ${radius} 0 0 0 ${x1} ${y1}
        Z`;

            const isWinning = winningIndex === i;
            let segmentClass = "";
            if (isWinning && segments[i]?.label === "0.00x") segmentClass = "segment-loss";
            else if (isWinning) segmentClass = "segment-winner";
            else if (winningIndex !== null) segmentClass = "segment-loser";

            paths.push(<path d={path} fill={segments[i].color} key={i} className={segmentClass} />);
        }
        return paths;
    };

    // On small screens the wheel can sit above the fold while the bet panel is
    // in view — spinning an off-screen wheel shows nothing. Bring it (mostly)
    // into the viewport and let the smooth scroll settle before spinning.
    const ensureWheelVisible = async () => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewH = window.innerHeight || document.documentElement.clientHeight;
        const visible = Math.min(rect.bottom, viewH) - Math.max(rect.top, 0);
        if (visible >= rect.height * 0.6) return; // already mostly on screen
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((resolve) => setTimeout(resolve, 450));
    };

    // Drive the wheel to the SERVER-chosen segment. The money (payout/newBalance)
    // is already settled by wheelSpin — this only animates and presents.
    const animateToWinner = (index: number, multiplier: number, payout: number) => {
        const n = segments.length;
        if (!n) return;
        const anglePerSegment = 360 / n;
        const spins = Math.floor(Math.random() * 5) + 5;

        if (spinSound.current) {
            spinSound.current.currentTime = 0;
            spinSound.current.play().catch(() => {});
        }

        setRotation((prevRotation) => {
            // Land the CENTER of `index` exactly under the top pointer, several full
            // spins beyond the current angle.
            const base = Math.ceil(prevRotation / 360) * 360;
            const newRotation = base + spins * 360 + (n - index) * anglePerSegment;
            if (wheelRef.current) wheelRef.current.style.transform = `rotate(${newRotation}deg)`;

            setTimeout(() => {
                // Trust the server multiplier/payout for the presentation.
                setResult(`${multiplier.toFixed(2)}x`);
                setStarted(false);
                setUnsettled(false);
                sessionIdRef.current = null;
                spinPromiseRef.current = null;
                setEarnings(payout);
                setWinningIndex(index);
                if (payout > 0 && winSound.current) {
                    winSound.current.currentTime = 0;
                    winSound.current.play().catch(() => {});
                }
                setEarningsDisplay(true);
                setTimeout(() => setWinningIndex(null), 1800);
                // numbers land, breathe, then the hub fades back to idle
                setTimeout(() => setEarningsDisplay(false), 2500);
            }, 4200);

            return newRotation;
        });
    };

    useEffect(() => {
        setSegments(generateSegments(difficulty, segmentCount));
        setEarningsDisplay(false);
        const wheel = wheelRef.current;
        if (wheel) {
            wheel.classList.add("no-transition");
            wheel.style.transform = `rotate(0deg)`;
            setTimeout(() => {
                wheel.classList.remove("no-transition");
                setRotation(0);
            }, 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [difficulty, segmentCount]);

    const startGame = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            setShowSignInDialog(true);
            return;
        }
        if (amount < MIN_BET) {
            showNotification(`Minimum bet is ₹${MIN_BET}`);
            return;
        }
        if (amount > wallet) {
            showNotification("Insufficient balance!");
            return;
        }
        // Lock the button and tense the wheel IMMEDIATELY — the server
        // round-trip for the wager must never read as dead air.
        setStarted(true);
        setResult(null);
        setEarningsDisplay(false);
        setWinningIndex(null);
        setAnticipating(true);
        // Mobile: the wheel must be watchable before anything spins.
        await ensureWheelVisible();
        // Place the wager server-side. The server owns the segment ring and the
        // outcome — the client never decides the win.
        const session = await startGameSession(amount, "WHEEL", { risk: difficulty, segments: segmentCount });
        setAnticipating(false);
        if (!session.success || !session.sessionId) {
            setStarted(false);
            showNotification("Failed to place bet");
            return;
        }

        const sid = session.sessionId;
        sessionIdRef.current = sid;
        setStaked(amount);
        setUnsettled(true); // wager confirmed — money is riding until the spin settles

        // Ask the server for the outcome. Keep the promise so the leave guard can
        // settle the SAME call if the player walks away mid-spin.
        const spin = wheelSpin(sid);
        spinPromiseRef.current = spin;
        const res = await spin;

        // The player left mid-spin — the leave guard already settled this session.
        if (sessionIdRef.current !== sid) return;

        if (!res) {
            setStarted(false);
            setUnsettled(false);
            sessionIdRef.current = null;
            spinPromiseRef.current = null;
            showNotification("Spin failed — please try again");
            return;
        }

        // `index` maps directly into the segment ring the client drew. Sanity-check
        // against the drawn label, but always trust the server for the money.
        const drawn = parseFloat(segments[res.index]?.label ?? "");
        if (Number.isNaN(drawn) || drawn !== res.multiplier) {
            console.warn(
                `[FortuneWheel] segment/server mismatch at index ${res.index}: drawn ${drawn} vs server ${res.multiplier} — trusting server.`
            );
        }
        animateToWinner(res.index, res.multiplier, res.payout);
    };

    const handleHalf = (e: React.MouseEvent) => {
        e.preventDefault();
        setAmount(parseFloat(Math.max(MIN_BET, amount / 2).toFixed(2)));
    };
    const handleDouble = (e: React.MouseEvent) => {
        e.preventDefault();
        setAmount(parseFloat(Math.min(wallet || amount * 2, amount * 2).toFixed(2)));
    };
    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setAmount(v === "" ? 0 : isNaN(parseFloat(v)) ? 0 : parseFloat(v));
    };

    const legend = difficulty === "hard"
        ? ["0.00x", `${(segmentCount - 0.5).toFixed(2)}x`]
        : multi_divs[difficulty];

    const resultMult = result ? parseFloat(result) || 0 : 0;

    return (
        <>
            <Navbar />

            <main className="game-stage fw-stage">
                <AnimatePresence>
                    {notification && (
                        <motion.div
                            className="game-toast"
                            initial={{ opacity: 0, y: -16, x: "-50%" }}
                            animate={{ opacity: 1, y: 0, x: "-50%" }}
                            exit={{ opacity: 0, y: -16, x: "-50%" }}
                        >
                            {notification}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="game-shell">
                    <GameHeader
                        eyebrow={`${difficulty} risk · ${segmentCount} segments`}
                        title="FORTUNE"
                        titleAccent="wheel"
                        tagline="Set your risk. One spin. Live with where it lands."
                        onHowToPlay={() => setShowRules(true)}
                    />

                    <div className="game-layout fw-layout">
                        {/* wheel */}
                        <div className={`game-board fw-board${anticipating ? " is-staging" : ""}`}>
                            {awayResult && (
                                <div className={`fw-away ${awayResult.win ? "is-win" : "is-loss"}`}>
                                    <span className="fw-away__text">
                                        While you were away: {awayResult.mult.toFixed(2)}× ·{" "}
                                        {awayResult.win
                                            ? `+₹${awayResult.amount.toFixed(2)} banked`
                                            : `−₹${awayResult.amount.toFixed(2)}`}
                                    </span>
                                    <button
                                        type="button"
                                        className="fw-away__dismiss"
                                        onClick={() => setAwayResult(null)}
                                        aria-label="Dismiss"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            )}

                            {/* legend sits ABOVE the wheel so payouts read without scrolling */}
                            <div className="fw-legend">
                                {legend.map((m, i) => (
                                    <span
                                        key={i}
                                        className="fw-multi"
                                        style={{ borderBottomColor: multiplierColors[m] || "#FF4438" }}
                                    >
                                        {m}
                                    </span>
                                ))}
                            </div>

                            <div className="fw-wrap" ref={wrapRef}>
                                {/* pin: mounted above the rim, tip reaching into the segment band */}
                                <svg className="fw-pin" viewBox="0 0 40 64" aria-hidden="true">
                                    <defs>
                                        <linearGradient id="fwPinGold" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0" stopColor="#FFD877" />
                                            <stop offset="0.55" stopColor="#E9B949" />
                                            <stop offset="1" stopColor="#A9791F" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M 20 62 L 8.5 21 A 13 13 0 1 1 31.5 21 Z" fill="url(#fwPinGold)" />
                                    <circle cx="20" cy="15" r="4.5" fill="#0B0910" stroke="rgba(255, 216, 119, 0.55)" strokeWidth="1" />
                                </svg>
                                <svg
                                    viewBox={`0 0 ${radius * 2} ${radius * 2}`}
                                    className={`wheel-svg${anticipating ? " fw-anticipate" : ""}`}
                                    ref={wheelRef}
                                    style={{ transform: `rotate(${rotation}deg)` }}
                                >
                                    {createSegments()}
                                    <circle cx={radius} cy={radius} r={radius / 3} stroke="var(--gold)" strokeWidth="3" fill="rgba(7,6,10,0.6)" />
                                </svg>

                                <AnimatePresence>
                                    {earningsDisplay && (
                                        <motion.div
                                            className="fw-overlay"
                                            initial={{ scale: 0.6, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ opacity: 0, transition: { duration: 0.45 } }}
                                            transition={{ type: "spring", stiffness: 300, damping: 18 }}
                                        >
                                            {earnings > 0 ? (
                                                <div className="fw-hub-result">
                                                    <span className="fw-hub-pulse" aria-hidden="true" />
                                                    <span className="fw-hub-result__mult">{resultMult.toFixed(2)}×</span>
                                                    <span className="fw-hub-result__amt is-win">
                                                        <CountUp to={earnings} prefix="+₹" decimals={2} duration={1200} />
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="fw-hub-result fw-hub-result--shake">
                                                    <span className="fw-hub-result__mult fw-hub-result__mult--loss">0.00×</span>
                                                    <span className="fw-hub-result__amt is-loss">−₹{staked.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {anticipating && <p className="staging-note">Weighting the wheel…</p>}
                        </div>

                        {/* control panel */}
                        <aside className="game-panel fw-panel">
                            <form onSubmit={startGame}>
                                <div className="game-field">
                                    <label className="game-label">Bet Amount</label>
                                    <input
                                        className="game-input"
                                        type="number"
                                        value={amount || ""}
                                        onChange={handleAmountChange}
                                        placeholder="Enter amount"
                                        step="any"
                                        min={MIN_BET}
                                        disabled={started}
                                    />
                                    <div className="game-adjust">
                                        <button type="button" onClick={handleHalf} disabled={started}>½</button>
                                        <button type="button" onClick={handleDouble} disabled={started}>2×</button>
                                    </div>
                                </div>

                                <div className="game-field">
                                    <label className="game-label">Risk</label>
                                    <select
                                        className="game-select fw-risk"
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                                        disabled={started}
                                    >
                                        {(Object.keys(difficulties) as DifficultyLevel[]).map((lvl) => (
                                            <option key={lvl} value={lvl}>{lvl}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="game-field">
                                    <label className="game-label">Segments</label>
                                    <select
                                        className="game-select"
                                        value={segmentCount}
                                        onChange={(e) => setSegmentCount(Number(e.target.value))}
                                        disabled={started}
                                    >
                                        {no_of_segments.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* live payout preview — reacts to bet, risk and segment count */}
                                <div className="fw-payouts">
                                    <span className="fw-payouts__title">A win pays on this bet</span>
                                    {legend.filter((m) => parseFloat(m) > 0).map((m) => (
                                        <div className="fw-payouts__row" key={m}>
                                            <span
                                                className="fw-payouts__swatch"
                                                style={{ background: multiplierColors[m] || "#FF4438" }}
                                            />
                                            <span className="fw-payouts__mult">{m}</span>
                                            <span className="fw-payouts__amt">₹{((amount || 0) * parseFloat(m)).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>

                                <PendingButton
                                    pending={started}
                                    pendingLabel={anticipating ? "Weighting the wheel…" : "Spinning…"}
                                    type="submit"
                                >
                                    Spin the Wheel
                                </PendingButton>
                            </form>
                        </aside>
                    </div>
                </div>
            </main>

            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />

            {showRules && (
                <div className="howto-overlay" onClick={() => setShowRules(false)}>
                    <div className="howto-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="howto-close" onClick={() => setShowRules(false)} aria-label="Close"><X size={18} /></button>
                        <h3 className="howto-title">How to play Fortune Wheel</h3>
                        <ol className="howto-steps">
                            {WHEEL_RULES.map((s, i) => (
                                <li key={i}><span className="howto-num">{i + 1}</span>{s}</li>
                            ))}
                        </ol>
                        <p className="howto-tip"><strong>Tip:</strong> Higher risk has bigger top multipliers but more losing segments.</p>
                    </div>
                </div>
            )}
        </>
    );
};

export default FortuneWheel;
