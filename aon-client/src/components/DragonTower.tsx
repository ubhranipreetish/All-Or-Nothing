"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Coins, ChevronUp } from "lucide-react";
import "../styles/DragonTower.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";

type DifficultyLevel = "Low" | "Medium" | "High";

const difficulties: Record<DifficultyLevel, number> = {
    Low: 4,
    Medium: 3,
    High: 2,
};

// Emotional framing for difficulty labels
const difficultyLabels: Record<DifficultyLevel, string> = {
    Low: "Low Risk",
    Medium: "Medium Risk",
    High: "High Risk",
};

const MIN_BET = 1;

const generateDragons = (rows: number, difficulty: number): number[] => {
    return Array.from({ length: rows }, () =>
        Math.floor(Math.random() * difficulty)
    );
};

export default function DragonTower() {
    const { wallet, recordBet, recordWin } = useWallet();
    const { user } = useAuth();
    const [showSignInDialog, setShowSignInDialog] = useState(false);

    const [difficulty, setDifficulty] = useState<DifficultyLevel>("Low");
    const [dragons, setDragons] = useState<number[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [cashOut, setCashOut] = useState<boolean>(false);
    const [amount, setAmount] = useState<number>(100);
    const [started, setStarted] = useState<boolean>(false);
    const [notification, setNotification] = useState<string>("");

    // State for staggered dragon reveal
    const [revealedRows, setRevealedRows] = useState<number[]>([]);

    // State for multiplier pop animation
    const [multiplierPop, setMultiplierPop] = useState<boolean>(false);
    const prevSelectedLength = useRef<number>(0);

    // Ref for scrolling to tower on cashout
    const towerRef = useRef<HTMLDivElement>(null);

    // Handle staggered dragon reveal on game over
    useEffect(() => {
        if (gameOver && dragons.length > 0) {
            setRevealedRows([]);
            // The lost row is where the player clicked (selected.length is the row they were on)
            const lostRow = selected.length;

            // Reveal from lost row (where player died) upward to the top (row 9)
            // This tells the story: "This is what was above you"
            let delay = 0;
            for (let i = lostRow; i <= 9; i++) {
                setTimeout(() => {
                    setRevealedRows(prev => [...prev, i]);
                }, delay);
                delay += 70; // 70ms stagger between rows
            }
        } else if (!gameOver && !cashOut) {
            setRevealedRows([]);
        }
    }, [gameOver, dragons.length, cashOut, selected.length]);

    // Handle multiplier pop animation when progress is made
    useEffect(() => {
        if (selected.length > prevSelectedLength.current && selected.length > 0) {
            setMultiplierPop(true);
            const timer = setTimeout(() => setMultiplierPop(false), 150);
            return () => clearTimeout(timer);
        }
        prevSelectedLength.current = selected.length;
    }, [selected.length]);

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

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

        const success = await recordBet(amount, "DRAGON_TOWER");
        if (!success) {
            showNotification("Failed to place bet");
            return;
        }

        const level = difficulties[difficulty];
        setDragons(generateDragons(10, level));
        setSelected([]);
        setRevealedRows([]);
        setGameOver(false);
        setCashOut(false);
        setStarted(true);
        prevSelectedLength.current = 0;

        // Scroll to tower after bet (for mobile)
        setTimeout(() => {
            towerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    const handleTileClick = (row: number, index: number) => {
        if (!started || gameOver || cashOut || selected.length !== row) return;

        if (index === dragons[row]) {
            setGameOver(true);
        } else {
            setSelected([...selected, index]);
        }
    };

    const getMultiplier = (): string => {
        if (gameOver) return "0.00";
        const base = difficulties[difficulty];
        if (base === 4) {
            return (1.4 ** selected.length).toFixed(2);
        } else if (base === 3) {
            return (1.6 ** selected.length).toFixed(2);
        } else {
            return (1.8 ** selected.length).toFixed(2);
        }
    };

    const multiplier = getMultiplier();
    const earnings = parseFloat((amount * parseFloat(multiplier)).toFixed(2));

    const handleCashOut = async () => {
        if (gameOver) {
            setGameOver(false);
            setCashOut(false);
            setStarted(false);
            setSelected([]);
            setDragons([]);
            setRevealedRows([]);
            prevSelectedLength.current = 0;
            return;
        }

        // Scroll to tower before revealing (for mobile)
        towerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for scroll to complete
        await new Promise(r => setTimeout(r, 400));

        // At 1.00x (no moves made), return the original bet
        if (selected.length === 0) {
            await recordWin(amount, amount, "DRAGON_TOWER", 1.0);
            showNotification(`Returned ₹${amount.toFixed(2)} (no moves made)`);
        } else if (earnings > 0) {
            const multValue = parseFloat(multiplier);
            await recordWin(earnings, amount, "DRAGON_TOWER", multValue);
            showNotification(`Cashed out with ₹${earnings.toFixed(2)}!`);
        }
        setCashOut(true);
        setStarted(false);
        setSelected([]);
        setDragons([]);
        setRevealedRows([]);
        prevSelectedLength.current = 0;
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
        const value = e.target.value;
        if (value === "") {
            setAmount(0);
        } else {
            const parsed = parseFloat(value);
            setAmount(isNaN(parsed) ? 0 : parsed);
        }
    };

    // Check if a dragon in a specific row should be revealed (for staggered animation)
    const isDragonRevealed = (row: number): boolean => {
        if (!gameOver) return false;
        return revealedRows.includes(row);
    };

    return (
        <>
            <Navbar />

            <div className="app-wrapper2">
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

                <div className="main-layout2">
                    {/* Add game-active class for mobile sidebar collapse */}
                    <div className={`right-navbar2 ${started ? 'game-active' : ''}`}>
                        <form onSubmit={startGame}>
                            <label htmlFor="amount2">Bet Amount</label>
                            <input
                                id="amount2"
                                type="number"
                                value={amount || ""}
                                onChange={handleAmountChange}
                                placeholder="Enter Amount"
                                step="any"
                                min={MIN_BET}
                                disabled={started}
                                required
                            />
                            <div className="half-double2">
                                <button type="button" id="half2" onClick={handleHalf} disabled={started}>
                                    ½
                                </button>
                                <button type="button" id="double2" onClick={handleDouble} disabled={started}>
                                    2x
                                </button>
                            </div>
                            <label htmlFor="difficulty2">Difficulty Level</label>
                            <select
                                id="difficulty2"
                                value={difficulty}
                                onChange={(e) =>
                                    setDifficulty(e.target.value as DifficultyLevel)
                                }
                                disabled={started}
                                required
                            >
                                {(Object.keys(difficulties) as DifficultyLevel[]).map((level) => (
                                    <option key={level} value={level}>
                                        {difficultyLabels[level]}
                                    </option>
                                ))}
                            </select>
                            {!started ? (
                                <button id="bet2" type="submit">Bet</button>
                            ) : (
                                <div className="earnings-display2">
                                    <div className="stat-capsule">
                                        <span className="stat-label">Current Multiplier</span>
                                        <div className={`stat-value ${multiplierPop ? 'multiplier-pop' : ''}`}>
                                            {multiplier}x
                                            {/* Show upward arrow when multiplier increases */}
                                            {selected.length > 0 && !gameOver && (
                                                <ChevronUp className="arrow-up" size={18} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="stat-capsule" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                                        <span className="stat-label">Potential Earnings</span>
                                        <div className="stat-value" style={{ color: 'var(--success)' }}>₹{earnings.toFixed(2)}</div>
                                    </div>

                                    <button id="cashout" onClick={handleCashOut} type="button">
                                        {gameOver ? "Play Again" : "Cash Out"}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    <div className="container2">
                        <div className="tower2" ref={towerRef}>
                            {Array.from({ length: 10 }).map((_, row) => {
                                const isCurrentRow = started && row === selected.length && !gameOver && !cashOut;

                                return (
                                    <div
                                        className={`row2 ${isCurrentRow ? 'active-row' : ''}`}
                                        key={row}
                                        style={{
                                            gridTemplateColumns: `repeat(${difficulties[difficulty]}, 1fr)`,
                                        }}
                                    >
                                        {Array.from({ length: difficulties[difficulty] }).map(
                                            (_, index) => {
                                                const isProgressRevealed = selected.length > row;
                                                const isDragon = dragons[row] === index;
                                                const isSelected = selected[row] === index;
                                                const isAvailable = isCurrentRow;

                                                // For game over: use staggered reveal
                                                // For normal play: use immediate reveal
                                                const shouldRevealDragon = gameOver ? isDragonRevealed(row) : false;
                                                const isRevealed = isProgressRevealed || shouldRevealDragon || cashOut;

                                                return (
                                                    <motion.div
                                                        key={index}
                                                        className={`tile2 ${isRevealed && isDragon
                                                            ? "dragon2"
                                                            : isSelected
                                                                ? "safe2"
                                                                : isAvailable
                                                                    ? "available2"
                                                                    : ""
                                                            }`}
                                                        onClick={() => handleTileClick(row, index)}
                                                        whileHover={isAvailable ? { scale: 1.08, y: -5 } : {}}
                                                        whileTap={isAvailable ? { scale: 0.95 } : {}}
                                                        initial={isRevealed && (isDragon || isSelected) ? { scale: 0.8, opacity: 0 } : {}}
                                                        animate={isRevealed && (isDragon || isSelected) ? { scale: 1, opacity: 1 } : {}}
                                                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                                    >
                                                        {isRevealed && (
                                                            <div className="icon-wrapper">
                                                                {isDragon ? (
                                                                    <Flame size={28} />
                                                                ) : isSelected ? (
                                                                    <Coins size={28} />
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                );
                                            }
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />
        </>
    );
}
