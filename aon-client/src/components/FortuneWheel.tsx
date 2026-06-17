"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import "../styles/FortuneWheel.css";
import Navbar from "./Navbar";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
import { useTutorial } from "./tutorial/useTutorial";
import { WHEEL_STEPS } from "./tutorial/steps";
import TutorialController from "./tutorial/TutorialController";

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

    // Tutorial engine — shared across games. Owns the step machine; this
    // component supplies a cosmetic demo spin (no bet, no payout).
    const tut = useTutorial(WHEEL_STEPS, {
        onStart: () => {
            setStarted(false);
            setEarningsDisplay(false);
            setResult(null);
            setWinningIndex(null);
            setAmount(100);
        },
        onEnd: () => {
            setStarted(false);
            setEarningsDisplay(false);
            setWinningIndex(null);
        },
    });

    // Spin the wheel for show only — used inside the tutorial.
    const demoSpin = () => {
        const anglePerSegment = 360 / Math.max(segments.length, 1);
        const picked = Math.floor(Math.random() * Math.max(segments.length, 1));
        const rotate = 4 * 360 + (segments.length - picked) * anglePerSegment;

        if (spinSound.current) {
            spinSound.current.currentTime = 0;
            spinSound.current.play().catch(() => { });
        }

        setRotation((prev) => {
            const newRotation = prev + rotate;
            if (wheelRef.current) {
                wheelRef.current.style.transform = `rotate(${newRotation}deg)`;
            }
            return newRotation;
        });

        // Advance once the wheel has built up some momentum.
        setTimeout(() => tut.next(), 2000);
    };

    const isHighlighted = (id: string) => tut.isHighlighted(id);

    const segment_structure: Record<"low" | "medium", string[]> = {
        low: [
            "0.00x", "1.20x", "1.20x", "1.20x", "1.50x",
            "0.00x", "1.20x", "1.20x", "1.20x", "1.20x",
        ],
        medium: [
            "0.00x", "1.50x", "0.00x", "2.00x", "0.00x",
            "1.50x", "0.00x", "3.00x", "0.00x", "1.50x",
        ],
    };

    const multi_divs: Record<"low" | "medium", string[]> = {
        low: ["0.00x", "1.20x", "1.50x"],
        medium: ["0.00x", "1.50x", "2.00x", "3.00x"],
    };

    const difficulties: Record<DifficultyLevel, number> = {
        low: 4,
        medium: 3,
        hard: 2,
    };

    const multiplierColors: Record<string, string> = {
        "0.00x": "#2F3A44",      // Gunmetal Gray - loss state
        "1.20x": "#2DFFB3",      // Neon Mint - low risk
        "1.50x": "#2563EB",      // Royal Blue - mid-low reward
        "2.00x": "#F59E0B",      // Amber Orange - attention
        "3.00x": "#10B981",      // Emerald Green - rewarding
        "9.50x": "#DC2626",      // Crimson Red - high danger
        "19.50x": "#7C3AED",     // Electric Violet - rare
        "29.50x": "#EC4899",     // Hot Magenta - extreme
        "39.50x": "#22D3EE",     // Neon Cyan - jackpot
    };



    const no_of_segments = [10, 20, 30, 40];
    const strokeWidth = 20;

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

    const radius = 250;

    const generateSegments = (
        diff: DifficultyLevel,
        count: number
    ): Segment[] => {
        const segs: Segment[] = [];

        if (diff === "hard") {
            const jackpotMultiplier = `${(count - 0.5).toFixed(2)}x`;
            segs.push({
                label: jackpotMultiplier,
                color: multiplierColors[jackpotMultiplier] || "#FC1144",
            });
            for (let i = 1; i < count; i++) {
                segs.push({
                    label: "0.00x",
                    color: multiplierColors["0.00x"],
                });
            }
        } else {
            const times = Math.floor(count / 10);

            for (let i = 0; i < times; i++) {
                for (let j = 0; j < 10; j++) {
                    const label = segment_structure[diff][j];
                    segs.push({
                        label,
                        color: multiplierColors[label] || "#ccc",
                    });
                }
            }
        }

        return segs;
    };

    const createSegments = () => {
        const paths: React.ReactElement[] = [];
        const anglePerSegment = (2 * Math.PI) / segments.length;

        for (let i = 0; i < segments.length; i++) {
            const startAngle =
                i * anglePerSegment - Math.PI / 2 - Math.PI / segments.length;
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
        Z
      `;

            // Determine segment class based on winning state
            const isWinningSegment = winningIndex === i;
            const isLossResult = isWinningSegment && segments[i]?.label === '0.00x';
            const isWinResult = isWinningSegment && segments[i]?.label !== '0.00x';
            const isOtherSegment = winningIndex !== null && winningIndex !== i;

            let segmentClass = '';
            if (isLossResult) {
                segmentClass = 'segment-loss';
            } else if (isWinResult) {
                segmentClass = 'segment-winner';
            } else if (isOtherSegment) {
                segmentClass = 'segment-loser';
            }

            paths.push(
                <path
                    d={path}
                    fill={segments[i].color}
                    key={i}
                    className={segmentClass}
                />
            );
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
            spinSound.current.play().catch(() => { });
        }

        setRotation((prevRotation) => {
            const newRotation = prevRotation + rotate;

            if (wheelRef.current) {
                wheelRef.current.style.transform = `rotate(${newRotation}deg)`;
            }

            setTimeout(() => {
                const resultText = segments[resultIndex]?.label || "Unknown";
                setResult(resultText);

                const label = segments[resultIndex]?.label || "0x";
                const multiplierVal = parseFloat(label);
                const totalReturn = amount * (isNaN(multiplierVal) ? 0 : multiplierVal);

                // Prevent double-execution (React StrictMode can cause this)
                if (!hasAddedWinnings.current) {
                    hasAddedWinnings.current = true;
                    if (totalReturn > 0) {
                        recordWin(totalReturn, amount, "WHEEL", multiplierVal);
                    }
                }
                setStarted(false);
                setEarnings(totalReturn);

                // Trigger winning segment highlight
                setWinningIndex(resultIndex);

                if (multiplierVal !== 0) {
                    if (winSound.current) {
                        winSound.current.currentTime = 0;
                        winSound.current.play().catch(() => { });
                    }
                }
                setEarningsDisplay(true);

                // Reset highlight after 1.2 seconds
                setTimeout(() => {
                    setWinningIndex(null);
                }, 1200);
            }, 4200);

            return newRotation;
        });
    };

    useEffect(() => {
        const newSegments = generateSegments(difficulty, segmentCount);
        setSegments(newSegments);
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
    }, [difficulty, segmentCount]);

    const startGame = async (e: React.FormEvent) => {
        e.preventDefault();

        // Tutorial: Spin triggers a cosmetic demo spin, no bet is placed.
        if (tut.isActive) {
            if (tut.isTarget("bet3")) {
                demoSpin();
            }
            return;
        }

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

        // Reset the guard for new spin
        hasAddedWinnings.current = false;

        setStarted(true);
        setResult(null);
        setEarningsDisplay(false);
        spinWheel();
    };

    const handleHalf = (e: React.MouseEvent) => {
        e.preventDefault();
        const newAmount = Math.max(MIN_BET, amount / 2);
        setAmount(parseFloat(newAmount.toFixed(2)));
    };

    const handleDouble = (e: React.MouseEvent) => {
        e.preventDefault();
        const newAmount = Math.min(wallet, amount * 2);
        setAmount(parseFloat(newAmount.toFixed(2)));
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Lock real inputs while the tutorial is driving the UI.
        if (tut.isActive && !tut.isTarget("amount3")) return;
        const value = e.target.value;
        if (value === "") {
            setAmount(0);
        } else {
            const parsed = parseFloat(value);
            setAmount(isNaN(parsed) ? 0 : parsed);
        }
    };

    return (
        <>
            <Navbar />

            <div className="app-wrapper3">
                <AnimatePresence>
                    {notification && (
                        <motion.div
                            className="toast-notification"
                            initial={{ opacity: 0, y: -20, x: "-50%" }}
                            animate={{ opacity: 1, y: 0, x: "-50%" }}
                            exit={{ opacity: 0, y: -20, x: "-50%" }}
                        >
                            {notification}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Shared tutorial: trigger button + backdrop + tooltip */}
                <TutorialController tutorial={tut} triggerDisabled={started} />

                <div className={`main-layout3 ${tut.isActive ? 'tutorial-active' : ''}`}>
                    <div className="right-navbar3">
                        <form onSubmit={startGame}>
                            <label htmlFor="amount3">Bet Amount</label>
                            <div
                                className={isHighlighted("amount3") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => { if (tut.handleClick("amount3")) return; }}
                            >
                                <input
                                    id="amount3"
                                    type="number"
                                    value={amount || ""}
                                    onChange={handleAmountChange}
                                    placeholder="Enter Amount"
                                    step="any"
                                    min={MIN_BET}
                                    disabled={started}
                                    required
                                />
                            </div>
                            <div className="half-double3">
                                <button
                                    type="button"
                                    id="half3"
                                    className={isHighlighted("half3") ? "tutorial-highlight-wrapper" : ""}
                                    onClick={(e) => {
                                        if (tut.isActive && !tut.isTarget("half3")) return;
                                        handleHalf(e);
                                        if (tut.isActive && tut.isTarget("half3")) tut.next();
                                    }}
                                    disabled={started}
                                >
                                    ½
                                </button>
                                <button type="button" onClick={handleDouble} disabled={started || tut.isActive}>
                                    2x
                                </button>
                            </div>
                            <label htmlFor="difficulty3">Risk</label>
                            <div
                                className={isHighlighted("difficulty3") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => { if (tut.handleClick("difficulty3")) return; }}
                            >
                                <select
                                    id="difficulty3"
                                    value={difficulty}
                                    onChange={(e) => {
                                        if (tut.isActive && !tut.isTarget("difficulty3")) return;
                                        setDifficulty(e.target.value as DifficultyLevel);
                                    }}
                                    disabled={started}
                                    required
                                >
                                    {(Object.keys(difficulties) as DifficultyLevel[]).map((level) => (
                                        <option key={level}>{level}</option>
                                    ))}
                                </select>
                            </div>

                            <label htmlFor="segments-count">Segments</label>
                            <div
                                className={isHighlighted("segments-count") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => { if (tut.handleClick("segments-count")) return; }}
                            >
                                <select
                                    id="segments-count"
                                    value={segmentCount}
                                    onChange={(e) => {
                                        if (tut.isActive && !tut.isTarget("segments-count")) return;
                                        setSegmentCount(Number(e.target.value));
                                    }}
                                    disabled={started}
                                    required
                                >
                                    {no_of_segments.map((count) => (
                                        <option key={count} value={count}>
                                            {count}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                id="bet3"
                                type="submit"
                                className={isHighlighted("bet3") ? "tutorial-highlight-wrapper" : ""}
                                disabled={started}
                            >
                                Spin
                            </button>
                        </form>
                    </div>

                    <div className="container3">
                        <div className="wheel-wrapper">
                            <div className="pointer">
                                <span className="pointer-highlight" />
                            </div>

                            <svg
                                viewBox={`0 0 ${radius * 2} ${radius * 2}`}
                                className="wheel-svg"
                                ref={wheelRef}
                                style={{ transform: `rotate(${rotation}deg)` }}
                            >
                                {createSegments()}
                                <circle
                                    cx={radius}
                                    cy={radius}
                                    r={radius / 3}
                                    stroke="var(--primary-gold)"
                                    strokeWidth="4"
                                    fill="transparent"
                                />
                            </svg>

                            {earningsDisplay && (
                                <motion.div
                                    className="earnings-overlay"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                >
                                    <div className="earnings-overlay-inner">
                                        <div className="earnings-content earn-box">
                                            <div style={{ borderBottom: "3px solid #284654" }}>
                                                {result}
                                            </div>
                                            <div>₹{earnings.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                        </div>
                        {difficulty === "hard" ? (
                            <div
                                id="multipliers-legend"
                                className={`multipliers ${isHighlighted("multipliers-legend") ? "tutorial-highlight-wrapper" : ""}`}
                                onClick={() => tut.handleClick("multipliers-legend")}
                            >
                                <div
                                    className="multi"
                                    style={{ borderBottomColor: multiplierColors["0.00x"] }}
                                >
                                    0.00x
                                </div>
                                <div
                                    className="multi"
                                    style={{
                                        borderBottomColor:
                                            multiplierColors[`${(segmentCount - 0.5).toFixed(2)}x`] || "#FC1144",
                                    }}
                                >
                                    {(segmentCount - 0.5).toFixed(2)}x
                                </div>
                            </div>
                        ) : (
                            <div
                                id="multipliers-legend"
                                className={`multipliers ${isHighlighted("multipliers-legend") ? "tutorial-highlight-wrapper" : ""}`}
                                onClick={() => tut.handleClick("multipliers-legend")}
                            >
                                {multi_divs[difficulty].map((elem, i) => (
                                    <div
                                        className="multi"
                                        key={i}
                                        style={{ borderBottomColor: multiplierColors[elem] }}
                                    >
                                        {elem}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />
        </>
    );
};

export default FortuneWheel;
