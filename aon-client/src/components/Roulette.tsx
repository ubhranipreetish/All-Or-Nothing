"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, RotateCcw, Coins, ChevronDown } from "lucide-react";
import "../styles/Roulette.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import Footer from "./Footer";

// European roulette wheel order
const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

const CHIP_OPTIONS = [10, 50, 100];

interface Bet {
    type: string;
    value: number | string | number[];
    amount: number;
    numbers: number[];
}

const getNumberColor = (num: number): "red" | "black" | "green" => {
    if (num === 0) return "green";
    return RED_NUMBERS.includes(num) ? "red" : "black";
};

export default function Roulette() {
    const { wallet, deductMoney, addMoney } = useWallet();

    const [bets, setBets] = useState<Bet[]>([]);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [winnings, setWinnings] = useState(0);
    const [notification, setNotification] = useState("");
    const [ballAngle, setBallAngle] = useState(0); // Ball starts at 0 (pointing to number 0)
    const [ballPhase, setBallPhase] = useState<"idle" | "fast" | "slowing" | "pockets" | "drama" | "settled">("idle");
    const [winningSegmentIndex, setWinningSegmentIndex] = useState<number | null>(null);
    const [chipValue, setChipValue] = useState(10);
    const [showChipSelector, setShowChipSelector] = useState(false);
    const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
    const [ballScale, setBallScale] = useState(1);
    const [ballOffset, setBallOffset] = useState({ x: 0, y: 0 });
    const [hoveredBet, setHoveredBet] = useState<string | null>(null);

    const rouletteSound = useRef<HTMLAudioElement | null>(null);
    const winSound = useRef<HTMLAudioElement | null>(null);
    const tableRef = useRef<HTMLDivElement>(null);
    const hasAddedWinnings = useRef(false);
    const ballAnimationRef = useRef<number | null>(null);
    const lastBallAngleRef = useRef(0); // Stores final angle for next round

    useEffect(() => {
        rouletteSound.current = new Audio("/sounds/roulette.mp3");
        winSound.current = new Audio("/sounds/win.mp3");
    }, []);

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    const totalBet = bets.reduce((sum, bet) => sum + bet.amount, 0);

    const addBet = (type: string, value: number | string | number[], numbers: number[]) => {
        if (spinning) return;

        const betKey = `${type}-${JSON.stringify(value)}`;
        const existingBetIndex = bets.findIndex(
            (bet) => `${bet.type}-${JSON.stringify(bet.value)}` === betKey
        );

        if (existingBetIndex >= 0) {
            const newBets = [...bets];
            newBets[existingBetIndex].amount += chipValue;
            setBets(newBets);
        } else {
            setBets([...bets, { type, value, amount: chipValue, numbers }]);
        }
    };

    const removeBet = (type: string, value: number | string | number[]) => {
        if (spinning) return;

        const betKey = `${type}-${JSON.stringify(value)}`;
        const existingBetIndex = bets.findIndex(
            (bet) => `${bet.type}-${JSON.stringify(bet.value)}` === betKey
        );

        if (existingBetIndex >= 0) {
            const newBets = [...bets];
            if (newBets[existingBetIndex].amount <= chipValue) {
                newBets.splice(existingBetIndex, 1);
            } else {
                newBets[existingBetIndex].amount -= chipValue;
            }
            setBets(newBets);
        }
    };

    const getBetAmount = (type: string, value: number | string | number[]): number => {
        const betKey = `${type}-${JSON.stringify(value)}`;
        const bet = bets.find((b) => `${b.type}-${JSON.stringify(b.value)}` === betKey);
        return bet ? bet.amount : 0;
    };

    const clearBets = () => {
        if (spinning) return;
        setBets([]);
    };

    const handleTouchStart = (type: string, value: number | string | number[], numbers: number[]) => {
        const timer = setTimeout(() => {
            removeBet(type, value);
        }, 500);
        setLongPressTimer(timer);
    };

    const handleTouchEnd = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    // Check if number is highlighted by current hover
    const isNumberHighlighted = (num: number): boolean => {
        if (!hoveredBet) return false;

        switch (hoveredBet) {
            case "column1": return num !== 0 && num % 3 === 1;
            case "column2": return num !== 0 && num % 3 === 2;
            case "column3": return num !== 0 && num % 3 === 0;
            case "dozen1": return num >= 1 && num <= 12;
            case "dozen2": return num >= 13 && num <= 24;
            case "dozen3": return num >= 25 && num <= 36;
            case "low": return num >= 1 && num <= 18;
            case "high": return num >= 19 && num <= 36;
            case "red": return RED_NUMBERS.includes(num);
            case "black": return BLACK_NUMBERS.includes(num);
            case "odd": return num !== 0 && num % 2 === 1;
            case "even": return num !== 0 && num % 2 === 0;
            default: return false;
        }
    };

    const calculateWinnings = (resultNum: number): { total: number; winningBets: string[] } => {
        let total = 0;
        const winningBets: string[] = [];
        const color = getNumberColor(resultNum);

        for (const bet of bets) {
            let payout = 0;
            let won = false;

            switch (bet.type) {
                case "straight":
                    if (bet.numbers.includes(resultNum)) {
                        payout = bet.amount * 36;
                        won = true;
                    }
                    break;
                case "split":
                    if (bet.numbers.includes(resultNum)) {
                        payout = bet.amount * 18;
                        won = true;
                    }
                    break;
                case "street":
                    if (bet.numbers.includes(resultNum)) {
                        payout = bet.amount * 12;
                        won = true;
                    }
                    break;
                case "corner":
                    if (bet.numbers.includes(resultNum)) {
                        payout = bet.amount * 9;
                        won = true;
                    }
                    break;
                case "sixline":
                    if (bet.numbers.includes(resultNum)) {
                        payout = bet.amount * 6;
                        won = true;
                    }
                    break;
                case "red":
                    if (color === "red") {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "black":
                    if (color === "black") {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "odd":
                    if (resultNum !== 0 && resultNum % 2 === 1) {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "even":
                    if (resultNum !== 0 && resultNum % 2 === 0) {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "low":
                    if (resultNum >= 1 && resultNum <= 18) {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "high":
                    if (resultNum >= 19 && resultNum <= 36) {
                        payout = bet.amount * 2;
                        won = true;
                    }
                    break;
                case "dozen1":
                    if (resultNum >= 1 && resultNum <= 12) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
                case "dozen2":
                    if (resultNum >= 13 && resultNum <= 24) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
                case "dozen3":
                    if (resultNum >= 25 && resultNum <= 36) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
                case "column1":
                    if (resultNum !== 0 && resultNum % 3 === 1) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
                case "column2":
                    if (resultNum !== 0 && resultNum % 3 === 2) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
                case "column3":
                    if (resultNum !== 0 && resultNum % 3 === 0) {
                        payout = bet.amount * 3;
                        won = true;
                    }
                    break;
            }

            if (won) {
                winningBets.push(`${bet.type}-${JSON.stringify(bet.value)}`);
            }
            total += payout;
        }

        return { total, winningBets };
    };

    // ========== CONTINUOUS BALL ANIMATION (RAF-based) ==========
    const startBallAnimation = useCallback((targetIndex: number) => {
        const segmentAngle = 360 / WHEEL_NUMBERS.length;

        // The wheel is static. Segment 0 (number 0) is at the top.
        // Ball track rotation of 0 = ball at top = aligned with segment 0
        // To land on segment at targetIndex, ball needs to rotate to that segment's center
        const targetPosition = targetIndex * segmentAngle + segmentAngle / 2;

        // Start from where we left off
        const startAngle = lastBallAngleRef.current;

        // Normalize start angle to 0-360 range
        const normalizedStart = ((startAngle % 360) + 360) % 360;

        // We want to spin counter-clockwise (which is negative rotation in CSS)
        // But for calculation, let's think in positive angles going clockwise
        // The ball needs to travel: 8 full rotations + distance to target
        const fullRotations = 8 * 360;

        // Calculate how far we need to go from normalized start to target
        let distanceToTarget = targetPosition - normalizedStart;
        if (distanceToTarget < 0) {
            distanceToTarget += 360; // Wrap around
        }

        // Total travel (positive = clockwise in our mental model)
        const totalTravel = fullRotations + distanceToTarget;

        // Final angle (we go positive direction from start)
        const finalAngle = startAngle + totalTravel;

        const startTime = performance.now();
        const duration = 9000;

        // Single smooth easing curve - cubic bezier approximation
        // Fast start, very gradual slowdown, no speed jumps
        const smoothEase = (t: number): number => {
            // Custom curve: fast initial, smooth deceleration
            // Approximates cubic-bezier(0.25, 0.1, 0.25, 1.0) but with more initial speed
            const p = 1 - t;
            return 1 - (p * p * p * p); // Quartic ease out
        };

        const animate = (time: number) => {
            const elapsed = time - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Apply smooth easing
            const eased = smoothEase(t);
            const currentAngle = startAngle + (finalAngle - startAngle) * eased;
            setBallAngle(currentAngle);

            // Phase styling (for visual effects only, doesn't affect speed)
            if (t < 0.375) {
                setBallPhase("fast");
                setBallScale(1 + Math.sin(elapsed * 0.012) * 0.01);
                setBallOffset({ x: 0, y: 0 });
            } else if (t < 0.625) {
                setBallPhase("slowing");
                setBallScale(1);
                setBallOffset({ x: 0, y: 0 });
            } else if (t < 0.875) {
                setBallPhase("pockets");
                // Very subtle offset, reduced randomness
                const jitter = Math.sin(elapsed * 0.05) * 0.5;
                setBallOffset({ x: jitter, y: 0.5 });
                setBallScale(0.98);
            } else if (t < 0.97) {
                setBallPhase("drama");
                setBallOffset({ x: 0, y: 0.3 });
                setBallScale(0.97);
            } else {
                setBallPhase("settled");
                setBallOffset({ x: 0, y: 0 });
                setBallScale(0.97);
            }

            if (t >= 1) {
                // Final position - store for next round
                setBallAngle(finalAngle);
                lastBallAngleRef.current = finalAngle;
                setBallPhase("settled");
                setBallScale(0.97);
                setBallOffset({ x: 0, y: 0 });

                if (ballAnimationRef.current) {
                    cancelAnimationFrame(ballAnimationRef.current);
                }
                return;
            }

            ballAnimationRef.current = requestAnimationFrame(animate);
        };

        ballAnimationRef.current = requestAnimationFrame(animate);
    }, []);

    const spin = () => {
        if (spinning || bets.length === 0) {
            if (bets.length === 0) showNotification("Place at least one bet!");
            return;
        }

        if (totalBet > wallet) {
            showNotification("Insufficient balance!");
            return;
        }

        const success = deductMoney(totalBet);
        if (!success) {
            showNotification("Failed to place bets");
            return;
        }

        hasAddedWinnings.current = false;
        setSpinning(true);
        setShowResult(false);
        setResult(null);
        setWinnings(0);
        setWinningSegmentIndex(null);
        setBallScale(1);
        setBallOffset({ x: 0, y: 0 });
        setBallPhase("fast");

        // Play roulette sound
        if (rouletteSound.current) {
            rouletteSound.current.currentTime = 0;
            rouletteSound.current.play().catch(() => { });
        }

        // Calculate result
        const resultIndex = Math.floor(Math.random() * WHEEL_NUMBERS.length);
        const resultNum = WHEEL_NUMBERS[resultIndex];

        // Start continuous ball animation
        startBallAnimation(resultIndex);

        // Reveal result at 9s (matches sound duration)
        setTimeout(() => {
            // Stop roulette sound
            if (rouletteSound.current) {
                rouletteSound.current.pause();
            }

            setResult(resultNum);
            setWinningSegmentIndex(resultIndex);
            setShowResult(true);
            setSpinning(false);

            const { total: won } = calculateWinnings(resultNum);
            setWinnings(won);

            if (!hasAddedWinnings.current && won > 0) {
                hasAddedWinnings.current = true;
                addMoney(won);
                if (winSound.current) {
                    winSound.current.currentTime = 0;
                    winSound.current.play().catch(() => { });
                }
                showNotification(`🎉 You won ₹${won.toFixed(2)}!`);
            } else if (won === 0) {
                showNotification(`Result: ${resultNum}. Better luck next time!`);
            }
        }, 9000);
    };

    const playAgain = () => {
        setShowResult(false);
        setResult(null);
        setWinnings(0);
        setWinningSegmentIndex(null);
        setBallPhase("idle");
        // Ball stays at last position (lastBallAngleRef.current)
        // No reset of ballAngle - it continues from where it stopped
        setBallScale(1);
        setBallOffset({ x: 0, y: 0 });
    };

    return (
        <>
            <Navbar />

            <div className="app-wrapper-roulette">
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

                <div className="roulette-main-layout">
                    {/* Wheel Section */}
                    <div className="roulette-wheel-section">
                        <div className="wheel-container">
                            <div className="wheel-outer">
                                {/* Wheel Shadow */}
                                <div className="wheel-shadow"></div>

                                {/* Static Wheel (no idle rotation) */}
                                <svg
                                    className="roulette-wheel"
                                    viewBox="0 0 400 400"
                                >
                                    {/* Outer gold ring */}
                                    <circle cx="200" cy="200" r="195" fill="none" stroke="url(#goldRingGradient)" strokeWidth="6" />

                                    {/* Define gradients */}
                                    <defs>
                                        <linearGradient id="goldRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#ffd700" />
                                            <stop offset="50%" stopColor="#b8860b" />
                                            <stop offset="100%" stopColor="#ffd700" />
                                        </linearGradient>
                                    </defs>

                                    {/* Wheel segments with 3D pockets and metal dividers */}
                                    {WHEEL_NUMBERS.map((num, i) => {
                                        const angle = (i * 360) / WHEEL_NUMBERS.length;
                                        const segmentAngle = 360 / WHEEL_NUMBERS.length;
                                        const color = getNumberColor(num);
                                        const midAngle = angle + segmentAngle / 2;
                                        const textRadius = 155;
                                        // Round to avoid SSR hydration mismatch
                                        const textX = Math.round((200 + textRadius * Math.cos(((midAngle - 90) * Math.PI) / 180)) * 100) / 100;
                                        const textY = Math.round((200 + textRadius * Math.sin(((midAngle - 90) * Math.PI) / 180)) * 100) / 100;
                                        const roundedMidAngle = Math.round(midAngle * 100) / 100;
                                        const isWinning = winningSegmentIndex === i && showResult;

                                        const segmentColor = color === "red" ? "#dc2626" : color === "black" ? "#1a1a1a" : "#16a34a";
                                        const segmentDark = color === "red" ? "#991b1b" : color === "black" ? "#0a0a0a" : "#15803d";

                                        return (
                                            <g key={num}>
                                                {/* Main pocket */}
                                                <path
                                                    d={describeArc(200, 200, 175, angle, angle + segmentAngle)}
                                                    fill={segmentColor}
                                                    stroke="#ffd700"
                                                    strokeWidth="1.5"
                                                    className={isWinning ? "winning-segment" : ""}
                                                />
                                                {/* Inner depth shadow */}
                                                <path
                                                    d={describeArc(200, 200, 165, angle + 0.5, angle + segmentAngle - 0.5)}
                                                    fill={segmentDark}
                                                    opacity="0.6"
                                                />
                                                {/* Metal divider (raised ridge) */}
                                                <path
                                                    d={describeDivider(200, 200, 178, angle)}
                                                    stroke="rgba(0,0,0,0.35)"
                                                    strokeWidth="1.5"
                                                    fill="none"
                                                />
                                                {/* Gold highlight on divider */}
                                                <path
                                                    d={describeDivider(200, 200, 176, angle)}
                                                    stroke="rgba(255,215,0,0.4)"
                                                    strokeWidth="0.5"
                                                    fill="none"
                                                />
                                                {/* Number */}
                                                <text
                                                    x={textX}
                                                    y={textY}
                                                    fill="white"
                                                    fontSize="11"
                                                    fontWeight="bold"
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    transform={`rotate(${roundedMidAngle}, ${textX}, ${textY})`}
                                                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                                                >
                                                    {num}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {/* Inner decorative rings */}
                                    <circle cx="200" cy="200" r="120" fill="#0f253d" stroke="#ffd700" strokeWidth="2" />
                                    <circle cx="200" cy="200" r="100" fill="#1a3a5c" stroke="rgba(255,215,0,0.3)" strokeWidth="1" />
                                    <circle cx="200" cy="200" r="60" fill="#0f253d" stroke="#ffd700" strokeWidth="2" />
                                    <circle cx="200" cy="200" r="40" fill="#1a3a5c" />

                                    {/* Center logo */}
                                    <text x="200" y="195" fill="#ffd700" fontSize="10" textAnchor="middle" opacity="0.6">ALL OR</text>
                                    <text x="200" y="210" fill="#ffd700" fontSize="10" textAnchor="middle" opacity="0.6">NOTHING</text>
                                </svg>

                                {/* Ball Track and Ball */}
                                <div
                                    className={`ball-track ${ballPhase}`}
                                    style={{
                                        transform: `rotate(${ballAngle}deg)`,
                                    }}
                                >
                                    <div
                                        className={`roulette-ball ${ballPhase}`}
                                        style={{
                                            transform: `translateX(-50%) scale(${ballScale}) translate(${ballOffset.x}px, ${ballOffset.y}px)`,
                                        }}
                                    >
                                        <div className="ball-shine"></div>
                                        <div className="ball-shadow"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Result Display */}
                        <AnimatePresence>
                            {showResult && result !== null && (
                                <motion.div
                                    className="result-display"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                >
                                    <div className={`result-number ${getNumberColor(result)} ${winnings > 0 ? 'winner' : ''}`}>
                                        {result}
                                    </div>
                                    <div className="result-info">
                                        {winnings > 0 ? (
                                            <span className="win-amount">+₹{winnings.toFixed(2)}</span>
                                        ) : (
                                            <span className="lose-text">No win</span>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Betting Table Section */}
                    <div className={`roulette-table-section ${result === 0 ? 'zero-result' : ''}`} ref={tableRef}>
                        <div className="table-header">
                            <h2>
                                <Target size={24} />
                                Place Your Bets
                            </h2>
                            <div className="bet-info">
                                <div className="chip-selector" onClick={() => setShowChipSelector(!showChipSelector)}>
                                    <span>Chip: ₹{chipValue}</span>
                                    <ChevronDown size={16} className={showChipSelector ? 'rotated' : ''} />

                                    {showChipSelector && (
                                        <div className="chip-dropdown">
                                            {CHIP_OPTIONS.map(val => (
                                                <div
                                                    key={val}
                                                    className={`chip-option ${chipValue === val ? 'active' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setChipValue(val);
                                                        setShowChipSelector(false);
                                                    }}
                                                >
                                                    ₹{val}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <span className="total-bet">Total: ₹{totalBet}</span>
                            </div>
                        </div>

                        <div className="betting-table">
                            {/* Zero */}
                            <div
                                className={`bet-cell zero ${getBetAmount("straight", 0) > 0 ? "has-bet" : ""}`}
                                onClick={() => addBet("straight", 0, [0])}
                                onContextMenu={(e) => { e.preventDefault(); removeBet("straight", 0); }}
                                onTouchStart={() => handleTouchStart("straight", 0, [0])}
                                onTouchEnd={handleTouchEnd}
                            >
                                <span>0</span>
                                {getBetAmount("straight", 0) > 0 && (
                                    <div className="chip">{getBetAmount("straight", 0)}</div>
                                )}
                            </div>

                            {/* Number Grid */}
                            <div className="numbers-grid">
                                {[...Array(12)].map((_, col) => (
                                    <div key={col} className="number-column">
                                        {[3, 2, 1].map((row) => {
                                            const num = col * 3 + row;
                                            const color = getNumberColor(num);
                                            const straightBet = getBetAmount("straight", num);
                                            const highlighted = isNumberHighlighted(num);

                                            return (
                                                <div
                                                    key={num}
                                                    className={`bet-cell number ${color} ${straightBet > 0 ? "has-bet" : ""} ${highlighted ? "hovered" : ""}`}
                                                    onClick={() => addBet("straight", num, [num])}
                                                    onContextMenu={(e) => { e.preventDefault(); removeBet("straight", num); }}
                                                    onTouchStart={() => handleTouchStart("straight", num, [num])}
                                                    onTouchEnd={handleTouchEnd}
                                                >
                                                    <span>{num}</span>
                                                    {straightBet > 0 && (
                                                        <div className="chip">{straightBet}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>

                            {/* Column Bets */}
                            <div className="column-bets">
                                {["column3", "column2", "column1"].map((col) => (
                                    <div
                                        key={col}
                                        className={`bet-cell column ${getBetAmount(col, col) > 0 ? "has-bet" : ""}`}
                                        onClick={() => addBet(col, col, [])}
                                        onContextMenu={(e) => { e.preventDefault(); removeBet(col, col); }}
                                        onMouseEnter={() => setHoveredBet(col)}
                                        onMouseLeave={() => setHoveredBet(null)}
                                    >
                                        <span>2:1</span>
                                        {getBetAmount(col, col) > 0 && (
                                            <div className="chip">{getBetAmount(col, col)}</div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Dozen Bets */}
                            <div className="dozen-bets">
                                {[
                                    { type: "dozen1", label: "1-12" },
                                    { type: "dozen2", label: "13-24" },
                                    { type: "dozen3", label: "25-36" }
                                ].map(({ type, label }) => (
                                    <div
                                        key={type}
                                        className={`bet-cell dozen ${getBetAmount(type, type) > 0 ? "has-bet" : ""}`}
                                        onClick={() => addBet(type, type, [])}
                                        onContextMenu={(e) => { e.preventDefault(); removeBet(type, type); }}
                                        onMouseEnter={() => setHoveredBet(type)}
                                        onMouseLeave={() => setHoveredBet(null)}
                                    >
                                        <span>{label}</span>
                                        {getBetAmount(type, type) > 0 && (
                                            <div className="chip">{getBetAmount(type, type)}</div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Outside Bets */}
                            <div className="outside-bets">
                                {[
                                    { type: "low", label: "1-18", className: "" },
                                    { type: "even", label: "EVEN", className: "" },
                                    { type: "red", label: "RED", className: "red-bet" },
                                    { type: "black", label: "BLACK", className: "black-bet" },
                                    { type: "odd", label: "ODD", className: "" },
                                    { type: "high", label: "19-36", className: "" }
                                ].map(({ type, label, className }) => (
                                    <div
                                        key={type}
                                        className={`bet-cell outside ${className} ${getBetAmount(type, type) > 0 ? "has-bet" : ""}`}
                                        onClick={() => addBet(type, type, [])}
                                        onContextMenu={(e) => { e.preventDefault(); removeBet(type, type); }}
                                        onMouseEnter={() => setHoveredBet(type)}
                                        onMouseLeave={() => setHoveredBet(null)}
                                    >
                                        <span>{label}</span>
                                        {getBetAmount(type, type) > 0 && (
                                            <div className="chip">{getBetAmount(type, type)}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="action-buttons">
                            <button
                                className="clear-btn"
                                onClick={clearBets}
                                disabled={spinning || bets.length === 0}
                            >
                                <RotateCcw size={18} />
                                Clear
                            </button>
                            <button
                                className="spin-btn"
                                onClick={showResult ? playAgain : spin}
                                disabled={spinning}
                            >
                                <Coins size={20} />
                                {showResult ? "New Round" : spinning ? "Spinning..." : "Spin"}
                            </button>
                        </div>

                        <p className="betting-tip">
                            Click to add chip • Right-click to remove • Hover outside bets to see coverage
                        </p>
                    </div>
                </div>

                {/* Mobile Sticky Footer */}
                <div className="mobile-sticky-footer">
                    <span className="mobile-total">Total: ₹{totalBet}</span>
                    <button
                        className="mobile-spin-btn"
                        onClick={showResult ? playAgain : spin}
                        disabled={spinning || (!showResult && bets.length === 0)}
                    >
                        {showResult ? "New Round" : spinning ? "Spinning..." : "SPIN"}
                    </button>
                </div>
            </div>
            <Footer />
        </>
    );
}

// Helper function to describe SVG arc
function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

// Helper function to describe pocket divider line
function describeDivider(cx: number, cy: number, radius: number, angle: number): string {
    const outer = polarToCartesian(cx, cy, radius, angle);
    const inner = polarToCartesian(cx, cy, 125, angle); // To inner ring
    return `M ${outer.x} ${outer.y} L ${inner.x} ${inner.y}`;
}

// Round to 2 decimal places for SSR consistency
function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number): { x: number; y: number } {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
        x: Math.round((cx + radius * Math.cos(angleInRadians)) * 100) / 100,
        y: Math.round((cy + radius * Math.sin(angleInRadians)) * 100) / 100
    };
}
