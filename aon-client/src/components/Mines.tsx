"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Tile from "./Tile";
import "../styles/Mines.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

const TILE_COUNT = 25;
const MIN_BET = 1;

interface TileData {
    isMine: boolean;
    revealed: boolean;
}

const generateBoard = (mineCount: number): TileData[] => {
    const board: TileData[] = Array.from({ length: TILE_COUNT }, () => ({
        isMine: false,
        revealed: false,
    }));
    let minesPlaced = 0;
    while (minesPlaced < mineCount) {
        const index = Math.floor(Math.random() * TILE_COUNT);
        if (!board[index].isMine) {
            board[index] = { ...board[index], isMine: true };
            minesPlaced++;
        }
    }
    return board;
};

export default function Mines() {
    const gemSound = useRef<HTMLAudioElement | null>(null);
    const mineSound = useRef<HTMLAudioElement | null>(null);

    const { wallet, startGameSession, recordWin, recordLoss } = useWallet();
    const { user } = useAuth();
    const [showSignInDialog, setShowSignInDialog] = useState(false);

    const [amount, setAmount] = useState<number>(100);
    const [mineCount, setMineCount] = useState<number>(3);
    const [board, setBoard] = useState<TileData[]>([]);
    const [started, setStarted] = useState<boolean>(false);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [revealedCount, setRevealedCount] = useState<number>(0);
    const [earnings, setEarnings] = useState<number>(0);
    const [multiplier, setMultiplier] = useState<string>("1.00");
    const [cashedOut, setCashedOut] = useState<boolean>(false);
    const [notification, setNotification] = useState<string>("");
    const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    // Restore an in-flight session on mount.
    useEffect(() => {
        gemSound.current = new Audio("/sounds/gem.mp3");
        mineSound.current = new Audio("/sounds/mine.mp3");
        gemSound.current.preload = "auto";
        mineSound.current.preload = "auto";

        const restoreSession = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/game/active?gameType=MINES`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.active) {
                        sessionIdRef.current = data.sessionId;
                        setAmount(data.betAmount);
                        setMultiplier(data.multiplier.toFixed(2));
                        if (data.gameConfig?.board) {
                            setBoard(data.gameConfig.board);
                            setMineCount(data.gameConfig.mineCount || 3);
                            const revealed = data.gameConfig.board.filter((t: TileData) => t.revealed).length;
                            setRevealedCount(revealed);
                            setEarnings(data.betAmount * data.multiplier);
                            setStarted(true);
                            setGameOver(false);
                            setCashedOut(false);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to restore session:", err);
            }
        };
        restoreSession();
    }, []);

    // Auto-close a headless/legacy active session so the player can start fresh.
    const checkActiveSession = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/game/active?gameType=MINES`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.active && !data.gameConfig?.board) {
                    await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/game/cashout`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ sessionId: data.sessionId }),
                    });
                }
            }
        } catch (err) {
            console.error("Failed to check active session:", err);
        }
    }, []);

    useEffect(() => {
        checkActiveSession();
    }, [checkActiveSession]);

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

        const initialBoard = generateBoard(mineCount);
        const { success, sessionId } = await startGameSession(amount, "MINES", {
            board: initialBoard,
            mineCount,
        });
        if (!success) {
            showNotification("Failed to place bet");
            return;
        }
        if (sessionId) sessionIdRef.current = sessionId;

        setBoard(initialBoard);
        setStarted(true);
        setGameOver(false);
        setRevealedCount(0);
        setEarnings(amount);
        setMultiplier("1.00");
        setCashedOut(false);
        setSpotlightIndex(null);

        setTimeout(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    };

    const waveReveal = async (lastIndex: number) => {
        const tilesWithDistance = board
            .map((_, i) => ({
                index: i,
                dist: Math.sqrt(
                    Math.pow(Math.floor(i / 5) - Math.floor(lastIndex / 5), 2) +
                    Math.pow((i % 5) - (lastIndex % 5), 2)
                ),
            }))
            .sort((a, b) => a.dist - b.dist);

        for (const item of tilesWithDistance) {
            setBoard((prev) => {
                const next = [...prev];
                next[item.index] = { ...next[item.index], revealed: true };
                return next;
            });
            await new Promise((r) => setTimeout(r, 40));
        }
    };

    const calculateMultiplier = (revealed: number, mines: number): number => {
        const safeTiles = TILE_COUNT - mines;
        let mult = 1;
        for (let i = 0; i < revealed; i++) {
            mult *= (TILE_COUNT - i) / (safeTiles - i);
        }
        return mult * 0.96;
    };

    const revealTile = async (index: number) => {
        if (!started || board[index]?.revealed || gameOver || cashedOut) return;

        setSpotlightIndex(index);
        setTimeout(() => setSpotlightIndex(null), 600);

        if (board[index].isMine) {
            if (mineSound.current) {
                mineSound.current.currentTime = 0;
                mineSound.current.play().catch(() => {});
            }
            setGameOver(true);
            setMultiplier("0.00");
            setEarnings(0);
            await waveReveal(index);
            if (sessionIdRef.current) {
                await recordLoss(sessionIdRef.current);
                sessionIdRef.current = null;
            }
        } else {
            if (gemSound.current) {
                gemSound.current.currentTime = 0;
                gemSound.current.play().catch(() => {});
            }
            const newRevealed = revealedCount + 1;
            setRevealedCount(newRevealed);
            const newMult = calculateMultiplier(newRevealed, mineCount);
            setMultiplier(newMult.toFixed(2));
            setEarnings(amount * newMult);
            setBoard((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], revealed: true };
                return next;
            });
        }
    };

    const handleCashOut = async () => {
        if (gameOver || cashedOut) {
            setStarted(false);
            setGameOver(false);
            setCashedOut(false);
            setBoard([]);
            setMultiplier("1.00");
            setEarnings(0);
            setRevealedCount(0);
            return;
        }

        if (earnings > amount) {
            await recordWin(earnings, amount, "MINES", parseFloat(multiplier));
            showNotification(`Cashed out ₹${earnings.toFixed(2)}!`);
        }
        gridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 300));
        setStarted(false);
        setCashedOut(true);
        await waveReveal(Math.floor(TILE_COUNT / 2));
    };

    const getThresholdHint = () => {
        const m = parseFloat(multiplier);
        if (m >= 2 && m < 5) return "Most players bank around 2–3×.";
        if (m >= 5 && m < 10) return "Risk climbs sharply past 5×.";
        if (m >= 10) return "Legend territory. Don't be greedy.";
        return "Reveal a gem to start the climb.";
    };

    const idle = !started && !gameOver && !cashedOut;
    const playing = started && !gameOver && !cashedOut;

    return (
        <>
            <Navbar />

            <main className="game-stage mines-page">
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
                            <span className="game-eyebrow"><span className="dot" /> Provably fair · {mineCount} mines</span>
                            <h1 className="game-title">MINES</h1>
                        </div>
                        <p className="game-sub">Flip gems, dodge the bombs, and bank it before the board blows.</p>
                    </header>

                    <div className="game-layout mines-layout">
                        {/* board */}
                        <div className="game-board" ref={gridRef}>
                            <div className="mines-grid">
                                {[...Array(TILE_COUNT)].map((_, index) => (
                                    <Tile
                                        key={index}
                                        tile={board[index] || { revealed: false, isMine: false }}
                                        onClick={() => revealTile(index)}
                                        disabled={gameOver || cashedOut || !started || spotlightIndex !== null}
                                        isDimmed={spotlightIndex !== null && spotlightIndex !== index}
                                        isSpotlight={spotlightIndex === index}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* control panel */}
                        <aside className="game-panel">
                            {idle && (
                                <form onSubmit={startGame}>
                                    <div className="game-field">
                                        <label className="game-label">Bet Amount</label>
                                        <input
                                            className="game-input"
                                            type="number"
                                            value={amount || ""}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                        />
                                        <div className="game-adjust">
                                            <button type="button" onClick={() => setAmount(Math.max(MIN_BET, Math.floor(amount / 2)))}>½</button>
                                            <button type="button" onClick={() => setAmount(Math.min(wallet || amount * 2, amount * 2))}>2×</button>
                                        </div>
                                    </div>

                                    <div className="game-field">
                                        <label className="game-label">Mines (1–24)</label>
                                        <input
                                            className="game-input"
                                            type="number"
                                            value={mineCount}
                                            onChange={(e) => setMineCount(Math.max(1, Math.min(24, Number(e.target.value))))}
                                        />
                                    </div>

                                    <button className="game-primary" type="submit">Place Bet</button>
                                </form>
                            )}

                            {playing && (
                                <div className="game-live">
                                    <div className="game-stat game-stat--mult">
                                        <div className="game-stat__label">Multiplier</div>
                                        <div className="game-stat__value">{multiplier}×</div>
                                    </div>
                                    <div className="game-stat game-stat--pay">
                                        <div className="game-stat__label">Cash Out Value</div>
                                        <div className="game-stat__value">₹{earnings.toFixed(2)}</div>
                                    </div>
                                    <p className="game-hint">{getThresholdHint()}</p>
                                    <button className="game-cashout" onClick={handleCashOut}>Cash Out ₹{earnings.toFixed(2)}</button>
                                </div>
                            )}

                            {(gameOver || cashedOut) && (
                                <div className="game-live">
                                    <div className={`mines-result ${gameOver ? "is-lost" : "is-won"}`}>
                                        <div className="mines-result__title">{gameOver ? "Boom." : "Banked."}</div>
                                        <div className="mines-result__sub">
                                            {gameOver
                                                ? "A mine caught you. The house keeps the bet."
                                                : `You walked away with ₹${earnings.toFixed(2)}.`}
                                        </div>
                                    </div>
                                    <button className="game-clear" onClick={handleCashOut}>New Round</button>
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
