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
import HowToPlay from "./HowToPlay";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

type DifficultyLevel = "Low" | "Medium" | "High";

const difficulties: Record<DifficultyLevel, number> = { Low: 4, Medium: 3, High: 2 };
const difficultyLabels: Record<DifficultyLevel, string> = {
    Low: "Low Risk · 4 tiles",
    Medium: "Medium Risk · 3 tiles",
    High: "High Risk · 2 tiles",
};

const MIN_BET = 1;
const ROWS = 10;

const generateDragons = (rows: number, difficulty: number): number[] =>
    Array.from({ length: rows }, () => Math.floor(Math.random() * difficulty));

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
    const [revealedRows, setRevealedRows] = useState<number[]>([]);
    const [multiplierPop, setMultiplierPop] = useState<boolean>(false);
    const prevSelectedLength = useRef<number>(0);
    const towerRef = useRef<HTMLDivElement>(null);

    // Staggered dragon reveal on game over.
    useEffect(() => {
        if (gameOver && dragons.length > 0) {
            setRevealedRows([]);
            const lostRow = selected.length;
            let delay = 0;
            for (let i = lostRow; i <= ROWS - 1; i++) {
                setTimeout(() => setRevealedRows((prev) => [...prev, i]), delay);
                delay += 70;
            }
        } else if (!gameOver && !cashOut) {
            setRevealedRows([]);
        }
    }, [gameOver, dragons.length, cashOut, selected.length]);

    // Multiplier pop when progress is made.
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

        setDragons(generateDragons(ROWS, difficulties[difficulty]));
        setSelected([]);
        setRevealedRows([]);
        setGameOver(false);
        setCashOut(false);
        setStarted(true);
        prevSelectedLength.current = 0;
        setTimeout(() => towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
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
        const factor = base === 4 ? 1.4 : base === 3 ? 1.6 : 1.8;
        return (factor ** selected.length).toFixed(2);
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

        towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 400));

        if (selected.length === 0) {
            await recordWin(amount, amount, "DRAGON_TOWER", 1.0);
            showNotification(`Returned ₹${amount.toFixed(2)} (no moves made)`);
        } else if (earnings > 0) {
            await recordWin(earnings, amount, "DRAGON_TOWER", parseFloat(multiplier));
            showNotification(`Cashed out ₹${earnings.toFixed(2)}!`);
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

    const isDragonRevealed = (row: number): boolean => gameOver && revealedRows.includes(row);
    const cols = difficulties[difficulty];

    return (
        <>
            <Navbar />

            <main className="game-stage dt-stage">
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

                <div className="game-shell dt-game">
                    <header className="game-head">
                        <div>
                            <span className="game-eyebrow"><span className="dot" /> {difficultyLabels[difficulty]}</span>
                            <h1 className="game-title">DRAGON <em>tower</em></h1>
                        </div>
                        <div className="game-head__right">
                            <p className="game-sub">Pick a safe stone each floor. One dragon ends the climb.</p>
                            <HowToPlay game="dragon" />
                        </div>
                    </header>

                    <div className="game-layout">
                        {/* tower */}
                        <div className="game-board">
                            <div className="dt-tower" ref={towerRef}>
                                {[...Array(ROWS)].map((_, row) => {
                                    const isCurrentRow = started && row === selected.length && !gameOver && !cashOut;
                                    return (
                                        <div
                                            className={`dt-row ${isCurrentRow ? "is-active" : ""}`}
                                            key={row}
                                            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                                        >
                                            {[...Array(cols)].map((_, index) => {
                                                const isProgressRevealed = selected.length > row;
                                                const isDragon = dragons[row] === index;
                                                const isSelected = selected[row] === index;
                                                const isRevealed = isProgressRevealed || isDragonRevealed(row) || cashOut;
                                                const cls = isRevealed && isDragon
                                                    ? "is-dragon"
                                                    : isSelected
                                                        ? "is-safe"
                                                        : isCurrentRow
                                                            ? "is-available"
                                                            : "";
                                                return (
                                                    <motion.button
                                                        key={index}
                                                        type="button"
                                                        className={`dt-tile ${cls}`}
                                                        onClick={() => handleTileClick(row, index)}
                                                        whileHover={isCurrentRow ? { scale: 1.06, y: -3 } : {}}
                                                        whileTap={isCurrentRow ? { scale: 0.95 } : {}}
                                                    >
                                                        {isRevealed && isDragon && <Flame size={24} />}
                                                        {isRevealed && isSelected && <Coins size={24} />}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* control panel */}
                        <aside className="game-panel">
                            {!started ? (
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
                                        />
                                        <div className="game-adjust">
                                            <button type="button" onClick={handleHalf}>½</button>
                                            <button type="button" onClick={handleDouble}>2×</button>
                                        </div>
                                    </div>
                                    <div className="game-field">
                                        <label className="game-label">Difficulty</label>
                                        <select
                                            className="game-select"
                                            value={difficulty}
                                            onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                                        >
                                            {(Object.keys(difficulties) as DifficultyLevel[]).map((lvl) => (
                                                <option key={lvl} value={lvl}>{difficultyLabels[lvl]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button className="game-primary" type="submit">Place Bet</button>
                                </form>
                            ) : (
                                <div className="game-live">
                                    <div className="game-stat game-stat--mult">
                                        <div className="game-stat__label">Multiplier</div>
                                        <div className={`game-stat__value ${multiplierPop ? "dt-pop" : ""}`}>
                                            {multiplier}×
                                            {selected.length > 0 && !gameOver && <ChevronUp className="dt-arrow" size={20} />}
                                        </div>
                                    </div>
                                    <div className="game-stat game-stat--pay">
                                        <div className="game-stat__label">Potential Earnings</div>
                                        <div className="game-stat__value">₹{earnings.toFixed(2)}</div>
                                    </div>
                                    <p className="game-hint">
                                        {gameOver ? "🔥 The dragon caught you." : `Floor ${selected.length} of ${ROWS} — keep climbing.`}
                                    </p>
                                    {gameOver ? (
                                        <button className="game-clear" onClick={handleCashOut}>Play Again</button>
                                    ) : (
                                        <button className="game-cashout" onClick={handleCashOut}>Cash Out ₹{earnings.toFixed(2)}</button>
                                    )}
                                </div>
                            )}
                        </aside>
                    </div>
                </div>
            </main>

            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />
        </>
    );
}
