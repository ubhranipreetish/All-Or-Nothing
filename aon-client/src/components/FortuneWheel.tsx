"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import "../styles/FortuneWheel.css";
import Navbar from "./Navbar";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

type DifficultyLevel = "low" | "medium" | "hard";

interface Segment {
    label: string;
    color: string;
}

const MIN_BET = 1;

const FortuneWheel = () => {
    const { wallet, recordBet, recordWin } = useWallet();
    const { user } = useAuth();
    const [showSignInDialog, setShowSignInDialog] = useState(false);

    const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");
    const [segmentCount, setSegmentCount] = useState<number>(20);
    const [amount, setAmount] = useState<number>(100);
    const [earnings, setEarnings] = useState<number>(0);
    const [earningsDisplay, setEarningsDisplay] = useState<boolean>(false);
    const [started, setStarted] = useState<boolean>(false);
    const [rotation, setRotation] = useState<number>(0);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [result, setResult] = useState<string | null>(null);
    const [idx, setIdx] = useState<number>(0);
    const [notification, setNotification] = useState<string>("");
    const [winningIndex, setWinningIndex] = useState<number | null>(null);

    const winSound = useRef<HTMLAudioElement | null>(null);
    const spinSound = useRef<HTMLAudioElement | null>(null);
    const wheelRef = useRef<SVGSVGElement | null>(null);
    const hasAddedWinnings = useRef<boolean>(false);

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

    const multiplierColors: Record<string, string> = {
        "0.00x": "#2A2533",
        "1.20x": "#2BD4A0",
        "1.50x": "#8B5CF6",
        "2.00x": "#F59E0B",
        "3.00x": "#2BD4A0",
        "9.50x": "#FF4438",
        "19.50x": "#A78BFA",
        "29.50x": "#EC4899",
        "39.50x": "#22D3EE",
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

    const spinWheel = () => {
        const spins = Math.floor(Math.random() * 5) + 5;
        const anglePerSegment = 360 / segments.length;
        const picked = Math.floor(Math.random() * segments.length);
        const rotate = spins * 360 + (segments.length - picked) * anglePerSegment;
        const resultIndex = (idx + picked) % segments.length;
        setIdx(resultIndex);

        if (spinSound.current) {
            spinSound.current.currentTime = 0;
            spinSound.current.play().catch(() => {});
        }

        setRotation((prevRotation) => {
            const newRotation = prevRotation + rotate;
            if (wheelRef.current) wheelRef.current.style.transform = `rotate(${newRotation}deg)`;

            setTimeout(() => {
                const resultText = segments[resultIndex]?.label || "Unknown";
                setResult(resultText);
                const multiplierVal = parseFloat(segments[resultIndex]?.label || "0x");
                const totalReturn = amount * (isNaN(multiplierVal) ? 0 : multiplierVal);

                if (!hasAddedWinnings.current) {
                    hasAddedWinnings.current = true;
                    if (totalReturn > 0) recordWin(totalReturn, amount, "WHEEL", multiplierVal);
                }
                setStarted(false);
                setEarnings(totalReturn);
                setWinningIndex(resultIndex);
                if (multiplierVal !== 0 && winSound.current) {
                    winSound.current.currentTime = 0;
                    winSound.current.play().catch(() => {});
                }
                setEarningsDisplay(true);
                setTimeout(() => setWinningIndex(null), 1200);
            }, 4200);

            return newRotation;
        });
    };

    useEffect(() => {
        setSegments(generateSegments(difficulty, segmentCount));
        setEarningsDisplay(false);
        setIdx(0);
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
        const success = await recordBet(amount, "WHEEL");
        if (!success) {
            showNotification("Failed to place bet");
            return;
        }
        hasAddedWinnings.current = false;
        setStarted(true);
        setResult(null);
        setEarningsDisplay(false);
        spinWheel();
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

    return (
        <>
            <Navbar />

            <main className="game-stage">
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
                    <header className="game-head">
                        <div>
                            <span className="game-eyebrow"><span className="dot" /> {difficulty} risk · {segmentCount} segments</span>
                            <h1 className="game-title">FORTUNE <em>wheel</em></h1>
                        </div>
                        <p className="game-sub">Set your risk. One spin. Live with where it lands.</p>
                    </header>

                    <div className="game-layout fw-layout">
                        {/* wheel */}
                        <div className="game-board fw-board">
                            <div className="fw-wrap">
                                <div className="fw-pointer" />
                                <svg
                                    viewBox={`0 0 ${radius * 2} ${radius * 2}`}
                                    className="wheel-svg"
                                    ref={wheelRef}
                                    style={{ transform: `rotate(${rotation}deg)` }}
                                >
                                    {createSegments()}
                                    <circle cx={radius} cy={radius} r={radius / 3} stroke="var(--gold)" strokeWidth="3" fill="rgba(7,6,10,0.6)" />
                                </svg>

                                {earningsDisplay && (
                                    <motion.div
                                        className="fw-overlay"
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                    >
                                        <span className="fw-overlay__result">{result}</span>
                                        <span className={`fw-overlay__amt ${earnings > 0 ? "is-win" : "is-loss"}`}>
                                            {earnings > 0 ? `+₹${earnings.toFixed(2)}` : "Busted"}
                                        </span>
                                    </motion.div>
                                )}

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
                            </div>
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
                                        className="game-select"
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

                                <button className="game-primary" type="submit" disabled={started}>
                                    {started ? "Spinning…" : "Spin the Wheel"}
                                </button>
                            </form>
                        </aside>
                    </div>
                </div>
            </main>

            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />
        </>
    );
};

export default FortuneWheel;
