"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Tile from "./Tile";
import "../styles/Mines.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import Footer from "./Footer";

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

    useEffect(() => {
        gemSound.current = new Audio("/sounds/gem.mp3");
        mineSound.current = new Audio("/sounds/mine.mp3");

        gemSound.current.preload = "auto";
        mineSound.current.preload = "auto";
    }, []);

    const { wallet, recordBet, recordWin } = useWallet();

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

    // Ref for scrolling to grid on cashout
    const gridRef = useRef<HTMLDivElement>(null);


    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    const startGame = async (e: React.FormEvent) => {
        e.preventDefault();

        if (amount < MIN_BET) {
            showNotification(`Minimum bet is ₹${MIN_BET}`);
            return;
        }
        if (amount > wallet) {
            showNotification("Insufficient balance!");
            return;
        }

        const success = await recordBet(amount, "MINES");
        if (!success) {
            showNotification("Failed to place bet");
            return;
        }

        setBoard(generateBoard(mineCount));
        setStarted(true);
        setGameOver(false);
        setRevealedCount(0);
        setEarnings(amount);
        setMultiplier("1.00");
        setCashedOut(false);
        setSpotlightIndex(null);

        // Scroll to grid after bet (for mobile)
        setTimeout(() => {
            gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    const waveReveal = async (lastIndex: number) => {
        const tilesWithDistance = board.map((_, i) => ({
            index: i,
            dist: Math.sqrt(
                Math.pow(Math.floor(i / 5) - Math.floor(lastIndex / 5), 2) +
                Math.pow((i % 5) - (lastIndex % 5), 2)
            )
        })).sort((a, b) => a.dist - b.dist);

        for (const item of tilesWithDistance) {
            setBoard(prev => {
                const next = [...prev];
                next[item.index] = { ...next[item.index], revealed: true };
                return next;
            });
            await new Promise(r => setTimeout(r, 40));
        }
    };

    const calculateMultiplier = (revealed: number, mines: number): number => {
        const totalTiles = TILE_COUNT;
        const safeTiles = totalTiles - mines;
        // House edge around 4%
        let mult = 1;
        for (let i = 0; i < revealed; i++) {
            mult *= (totalTiles - i) / (safeTiles - i);
        }
        return mult * 0.96;
    };

    const revealTile = async (index: number) => {
        if (!started || board[index]?.revealed || gameOver || cashedOut) return;

        // Visual Spotlight Effect
        setSpotlightIndex(index);
        setTimeout(() => setSpotlightIndex(null), 600);

        const isMine = board[index].isMine;

        if (isMine) {
            if (mineSound.current) {
                mineSound.current.currentTime = 0;
                mineSound.current.play().catch(() => { });
            }

            setGameOver(true);
            setMultiplier("0.00");
            setEarnings(0);

            // Wave reveal sequence
            await waveReveal(index);
        } else {
            if (gemSound.current) {
                gemSound.current.currentTime = 0;
                gemSound.current.play().catch(() => { });
            }

            const newRevealed = revealedCount + 1;
            setRevealedCount(newRevealed);

            const newMult = calculateMultiplier(newRevealed, mineCount);
            setMultiplier(newMult.toFixed(2));
            setEarnings(amount * newMult);

            setBoard(prev => {
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
            return;
        }

        if (earnings > amount) {
            const multValue = parseFloat(multiplier);
            await recordWin(earnings, amount, "MINES", multValue);
            showNotification(`Cashed out ₹${earnings.toFixed(2)}!`);
        }

        // Scroll to grid before revealing (for mobile)
        gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Small delay to allow scroll to complete
        await new Promise(r => setTimeout(r, 300));

        setStarted(false);
        setCashedOut(true);
        await waveReveal(Math.floor(TILE_COUNT / 2));
    };

    const getThresholdHint = () => {
        const multVal = parseFloat(multiplier);
        if (multVal >= 2 && multVal < 5) return "Many players cash out around 2x-3x";
        if (multVal >= 5 && multVal < 10) return "Risk increases sharply beyond 5x!";
        if (multVal >= 10) return "Legends are made here. Be careful.";
        return "";
    };

    return (
        <>
            <Navbar />

            <div className="app-wrapper1">
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

                <div className="main-layout1">
                    <div className="right-navbar1">
                        <form onSubmit={startGame}>
                            <label>Bet Amount</label>
                            <input
                                type="number"
                                value={amount || ""}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                disabled={started && !gameOver && !cashedOut}
                            />
                            <div className="half-double">
                                <button type="button" onClick={() => setAmount(Math.max(MIN_BET, amount / 2))} disabled={started}>½</button>
                                <button type="button" onClick={() => setAmount(Math.min(wallet, amount * 2))} disabled={started}>2x</button>
                            </div>

                            <label>Mines</label>
                            <input
                                type="number"
                                value={mineCount}
                                onChange={(e) => setMineCount(Math.max(1, Math.min(24, Number(e.target.value))))}
                                disabled={started}
                            />

                            {!started || gameOver || cashedOut ? (
                                <button id="bet1" type="submit">Bet</button>
                            ) : (
                                <div className="earnings-display1">
                                    <div className="stat-capsule">
                                        <span className="stat-label">Current Multiplier</span>
                                        <div className="stat-value">{multiplier}x</div>
                                    </div>

                                    <div className="stat-capsule" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                                        <span className="stat-label">Cash Out Amount</span>
                                        <div className="stat-value" style={{ color: 'var(--gem-success)' }}>₹{earnings.toFixed(2)}</div>
                                    </div>

                                    {getThresholdHint() && <div className="threshold-hint">{getThresholdHint()}</div>}

                                    <button id="cashout" onClick={handleCashOut} type="button">
                                        Cash Out
                                    </button>
                                </div>
                            )}

                            {(gameOver || cashedOut) && (
                                <button id="bet1" onClick={handleCashOut} type="button" style={{ background: 'var(--divider)', color: 'white', marginTop: '1rem' }}>
                                    Clear Table
                                </button>
                            )}
                        </form>
                    </div>

                    <div className="container1" ref={gridRef}>
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
            </div>
            <Footer />
        </>
    );
}


