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
    const { wallet, recordBet, recordWin, refundBet } = useWallet();
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
    const [notifTone, setNotifTone] = useState<"gold" | "ember">("gold");
    const [revealedRows, setRevealedRows] = useState<number[]>([]);
    const [multiplierPop, setMultiplierPop] = useState<boolean>(false);
    // Round sequencing: tower stays disabled until the round is ready to take
    // clicks; the cash-out request is in flight; the win verdict is banked;
    // the loss verdict waits for the dragon reveal to finish.
    const [boardReady, setBoardReady] = useState<boolean>(false);
    const [cashingOut, setCashingOut] = useState<boolean>(false);
    const [banked, setBanked] = useState<boolean>(false);
    const [bankedAmount, setBankedAmount] = useState<number>(0);
    const [lossRevealed, setLossRevealed] = useState<boolean>(false);
    const prevSelectedLength = useRef<number>(0);
    const towerRef = useRef<HTMLDivElement>(null);

    // Keep the tower visibly disabled until the round state has settled after
    // bet placement (and the scroll-into-view has landed) — prevents the first
    // click being swallowed while the board is still arming.
    useEffect(() => {
        if (!started) {
            setBoardReady(false);
            return;
        }
        const timer = setTimeout(() => setBoardReady(true), 600);
        return () => clearTimeout(timer);
    }, [started]);

    // Staggered dragon reveal on game over — reveal/flare first, verdict after.
    useEffect(() => {
        if (gameOver && dragons.length > 0) {
            setRevealedRows([]);
            setLossRevealed(false);
            const lostRow = selected.length;
            const timers: ReturnType<typeof setTimeout>[] = [];
            let delay = 0;
            for (let i = lostRow; i <= ROWS - 1; i++) {
                timers.push(setTimeout(() => setRevealedRows((prev) => [...prev, i]), delay));
                delay += 70;
            }
            // let the flare on the dragon tile land before the verdict panel
            timers.push(setTimeout(() => setLossRevealed(true), delay + 500));
            return () => timers.forEach(clearTimeout);
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

    const showNotification = (message: string, tone: "gold" | "ember" = "gold") => {
        setNotifTone(tone);
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    const resetRound = () => {
        setStarted(false);
        setGameOver(false);
        setCashOut(false);
        setBanked(false);
        setLossRevealed(false);
        setCashingOut(false);
        setSelected([]);
        setDragons([]);
        setRevealedRows([]);
        prevSelectedLength.current = 0;
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
            showNotification("Failed to place bet", "ember");
            return;
        }

        setDragons(generateDragons(ROWS, difficulties[difficulty]));
        setSelected([]);
        setRevealedRows([]);
        setGameOver(false);
        setCashOut(false);
        setBanked(false);
        setLossRevealed(false);
        setCashingOut(false);
        setStarted(true);
        prevSelectedLength.current = 0;
        setTimeout(() => towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    };

    const handleTileClick = (row: number, index: number) => {
        if (!started || !boardReady || gameOver || cashOut || cashingOut || selected.length !== row) return;
        if (index === dragons[row]) {
            setGameOver(true);
        } else {
            setSelected([...selected, index]);
        }
    };

    // per-floor payout progression — floor `row` (0-indexed) pays factor^(row+1)
    const stepBase = difficulties[difficulty];
    const stepFactor = stepBase === 4 ? 1.4 : stepBase === 3 ? 1.6 : 1.8;
    const floorMultiplier = (row: number): string => (stepFactor ** (row + 1)).toFixed(2);

    const getMultiplier = (): string => {
        if (gameOver) return "0.00";
        return (stepFactor ** selected.length).toFixed(2);
    };

    const multiplier = getMultiplier();
    const earnings = parseFloat((amount * parseFloat(multiplier)).toFixed(2));

    const handleCashOut = async () => {
        if (!started || gameOver || cashOut || cashingOut) return;

        setCashingOut(true);
        towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

        // Floor 0 — nothing climbed, pure refund of the stake.
        if (selected.length === 0) {
            const success = await refundBet("DRAGON_TOWER");
            setCashingOut(false);
            if (!success) {
                showNotification("Cash out failed — the round is still live. Try again.", "ember");
                return;
            }
            showNotification(`Stake returned — ₹${amount.toFixed(2)} back in the wallet.`);
            resetRound();
            return;
        }

        const success = await recordWin(earnings, amount, "DRAGON_TOWER", parseFloat(multiplier));
        setCashingOut(false);
        if (!success) {
            showNotification("Cash out failed — the round is still live. Try again.", "ember");
            return;
        }
        setBankedAmount(earnings);
        setCashOut(true); // full tower reveal behind the verdict
        setBanked(true);
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
    const arming = started && !boardReady && !gameOver && !cashOut;
    const settled = gameOver || cashOut;

    return (
        <>
            <Navbar />

            <main className="game-stage dt-stage">
                <AnimatePresence>
                    {notification && (
                        <motion.div
                            className={`game-toast ${notifTone === "ember" ? "dt-toast--ember" : ""}`}
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
                            <div
                                className={`dt-tower ${arming ? "is-arming" : ""} ${settled ? "is-settled" : ""}`}
                                ref={towerRef}
                            >
                                {[...Array(ROWS)].map((_, row) => {
                                    const isCurrentRow = started && row === selected.length && !gameOver && !cashOut;
                                    const isClimbed = selected.length > row;
                                    return (
                                        <div
                                            className={`dt-row ${isCurrentRow ? "is-active" : ""} ${isClimbed ? "is-climbed" : ""}`}
                                            key={row}
                                            style={{ gridTemplateColumns: `repeat(${cols}, 1fr) minmax(3.4em, auto)` }}
                                        >
                                            {[...Array(cols)].map((_, index) => {
                                                const isProgressRevealed = selected.length > row;
                                                const isDragon = dragons[row] === index;
                                                const isSelected = selected[row] === index;
                                                const isRevealed = isProgressRevealed || isDragonRevealed(row) || cashOut;
                                                const isHitDragon = gameOver && isDragon && row === selected.length;
                                                const cls = isRevealed && isDragon
                                                    ? `is-dragon ${isHitDragon ? "is-hit" : ""}`
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
                                                        whileHover={isCurrentRow && boardReady ? { scale: 1.06, y: -3 } : {}}
                                                        whileTap={isCurrentRow && boardReady ? { scale: 0.95 } : {}}
                                                    >
                                                        {isRevealed && isDragon && <Flame size={24} />}
                                                        {isRevealed && isSelected && <Coins size={24} />}
                                                    </motion.button>
                                                );
                                            })}
                                            {/* per-floor payout ladder */}
                                            <span
                                                className={`dt-row__mult ${isCurrentRow ? "is-active" : ""} ${isClimbed ? "is-climbed" : ""}`}
                                            >
                                                {floorMultiplier(row)}×
                                            </span>
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
                            ) : banked ? (
                                <div className="game-live">
                                    <motion.div
                                        className="dt-result is-won"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35 }}
                                    >
                                        <div className="dt-result__title">Banked.</div>
                                        <div className="dt-result__sub">You walked away with ₹{bankedAmount.toFixed(2)}.</div>
                                    </motion.div>
                                    <button className="game-clear" onClick={resetRound}>New Climb</button>
                                </div>
                            ) : gameOver && lossRevealed ? (
                                <div className="game-live">
                                    <motion.div
                                        className="dt-result is-lost"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35 }}
                                    >
                                        <div className="dt-result__title">Torched.</div>
                                        <div className="dt-result__amount">−₹{amount.toFixed(2)}</div>
                                        <div className="dt-result__sub">The dragon caught you. The house keeps the stake.</div>
                                    </motion.div>
                                    <button className="game-clear" onClick={resetRound}>New Climb</button>
                                </div>
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
                                        {gameOver
                                            ? "🔥 The dragon caught you."
                                            : !boardReady
                                                ? "Setting the floors…"
                                                : `Floor ${selected.length} of ${ROWS} — keep climbing.`}
                                    </p>
                                    {!gameOver && (
                                        <button className="game-cashout" onClick={handleCashOut} disabled={cashingOut}>
                                            {cashingOut ? "Cashing Out…" : `Cash Out ₹${earnings.toFixed(2)}`}
                                        </button>
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
