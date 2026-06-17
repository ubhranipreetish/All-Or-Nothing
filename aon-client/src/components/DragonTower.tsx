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
import { useTutorial } from "./tutorial/useTutorial";
import { DRAGON_TOWER_STEPS } from "./tutorial/steps";
import TutorialController from "./tutorial/TutorialController";

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

// Controlled tutorial tower: dragon sits in column 0 of every row, so column 1
// is always a guaranteed-safe demo tile.
const generateTutorialDragons = (): number[] => Array.from({ length: 10 }, () => 0);

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

    // Tutorial engine — shared across games. Owns the step machine; this
    // component supplies the controlled demo tower and reset side-effects.
    const tut = useTutorial(DRAGON_TOWER_STEPS, {
        onStart: () => {
            setStarted(false);
            setGameOver(false);
            setCashOut(false);
            setSelected([]);
            setDragons([]);
            setRevealedRows([]);
            setAmount(100);
            setDifficulty("Low");
            prevSelectedLength.current = 0;
        },
        onEnd: () => {
            setStarted(false);
            setGameOver(false);
            setCashOut(false);
            setSelected([]);
            setDragons([]);
            setRevealedRows([]);
            prevSelectedLength.current = 0;
        },
    });

    // Build the controlled demo tower when the player reaches the climb step.
    useEffect(() => {
        if (!tut.isActive) return;
        if (tut.currentStep?.id === "climb" && dragons.length === 0) {
            setDifficulty("Low");
            setDragons(generateTutorialDragons());
            setSelected([]);
            setRevealedRows([]);
            setGameOver(false);
            setCashOut(false);
            setStarted(true);
            prevSelectedLength.current = 0;
        }
    }, [tut.isActive, tut.stepIndex, tut.currentStep, dragons.length]);

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

        // Tutorial: the Bet button just advances the walkthrough.
        if (tut.isActive) {
            if (tut.isTarget("bet2")) {
                tut.next();
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
        // Tutorial: only the glowing safe tile (row 0, column 1) responds.
        if (tut.isActive) {
            if (tut.currentStep?.id === "climb" && row === 0 && index === 1) {
                setSelected([1]);
                setTimeout(() => tut.next(), 450);
            }
            return;
        }

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
        // Tutorial: the Cash Out button just advances the walkthrough.
        if (tut.isActive) {
            if (tut.isTarget("cashout")) {
                tut.next();
            }
            return;
        }

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
        // Lock real inputs while the tutorial is driving the UI.
        if (tut.isActive && !tut.isTarget("amount2")) return;
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

    const isHighlighted = (id: string) => tut.isHighlighted(id);

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

                {/* Shared tutorial: trigger button + backdrop + tooltip */}
                <TutorialController tutorial={tut} triggerDisabled={started && !tut.isActive} />

                <div className={`main-layout2 ${tut.isActive ? 'tutorial-active' : ''}`}>
                    {/* Keep the sidebar visible during the tutorial (no mobile collapse). */}
                    <div className={`right-navbar2 ${started && !tut.isActive ? 'game-active' : ''}`}>
                        <form onSubmit={startGame}>
                            <label htmlFor="amount2">Bet Amount</label>
                            <div
                                className={isHighlighted("amount2") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => { if (tut.handleClick("amount2")) return; }}
                            >
                                <input
                                    id="amount2"
                                    type="number"
                                    value={amount || ""}
                                    onChange={handleAmountChange}
                                    placeholder="Enter Amount"
                                    step="any"
                                    min={MIN_BET}
                                    disabled={started && !tut.isActive}
                                    required
                                />
                            </div>
                            <div className="half-double2">
                                <button
                                    type="button"
                                    id="half2"
                                    className={isHighlighted("half2") ? "tutorial-highlight-wrapper" : ""}
                                    onClick={(e) => {
                                        if (tut.isActive && !tut.isTarget("half2")) return;
                                        handleHalf(e);
                                        if (tut.isActive && tut.isTarget("half2")) tut.next();
                                    }}
                                    disabled={started && !tut.isActive}
                                >
                                    ½
                                </button>
                                <button
                                    type="button"
                                    id="double2"
                                    onClick={handleDouble}
                                    disabled={started || tut.isActive}
                                >
                                    2x
                                </button>
                            </div>
                            <label htmlFor="difficulty2">Difficulty Level</label>
                            <div
                                className={isHighlighted("difficulty2") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => { if (tut.handleClick("difficulty2")) return; }}
                            >
                                <select
                                    id="difficulty2"
                                    value={difficulty}
                                    onChange={(e) => {
                                        if (tut.isActive && !tut.isTarget("difficulty2")) return;
                                        setDifficulty(e.target.value as DifficultyLevel);
                                    }}
                                    disabled={started && !tut.isActive}
                                    required
                                >
                                    {(Object.keys(difficulties) as DifficultyLevel[]).map((level) => (
                                        <option key={level} value={level}>
                                            {difficultyLabels[level]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {!started ? (
                                <button
                                    id="bet2"
                                    type="submit"
                                    className={isHighlighted("bet2") ? "tutorial-highlight-wrapper" : ""}
                                >
                                    Bet
                                </button>
                            ) : (
                                <div className="earnings-display2">
                                    <div
                                        id="dt-multiplier"
                                        className={`stat-capsule ${isHighlighted("dt-multiplier") ? "tutorial-highlight-wrapper" : ""}`}
                                        onClick={() => tut.handleClick("dt-multiplier")}
                                    >
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

                                    <button
                                        id="cashout"
                                        className={isHighlighted("cashout") ? "tutorial-highlight-wrapper" : ""}
                                        onClick={handleCashOut}
                                        type="button"
                                    >
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

                                                const isTutorialTile =
                                                    tut.isActive &&
                                                    tut.currentStep?.id === "climb" &&
                                                    row === 0 &&
                                                    index === 1;
                                                const isTutorialDimmed =
                                                    tut.isActive &&
                                                    tut.currentStep?.id === "climb" &&
                                                    !isTutorialTile;

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
                                                            } ${isTutorialTile ? "tutorial-highlight-wrapper" : ""}`}
                                                        style={isTutorialDimmed ? { opacity: 0.3 } : undefined}
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
