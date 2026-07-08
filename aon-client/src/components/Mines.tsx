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
import HowToPlay from "./HowToPlay";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

const TILE_COUNT = 25;
const MIN_BET = 1;
const SWAP_GUARD_MS = 600; // primary button is inert this long after it swaps state
const RESET_WINDOW_MS = 450; // board stays gated while a new round settles in

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const [notificationTone, setNotificationTone] = useState<"info" | "error">("info");
    const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null);
    // --- round-flow gates ---
    const [hydrated, setHydrated] = useState<boolean>(false); // server round-state sync finished
    const [resetting, setResetting] = useState<boolean>(false); // brief window after New Round
    const [cashingOut, setCashingOut] = useState<boolean>(false); // recordWin in flight
    const [swapGuard, setSwapGuard] = useState<boolean>(false); // primary button just swapped state
    const [resultReady, setResultReady] = useState<boolean>(false); // BOOM panel gated behind the reveal
    const [killerIndex, setKillerIndex] = useState<number | null>(null); // the mine that ended the round
    const [resumed, setResumed] = useState<boolean>(false); // round restored from the server
    const [roundKey, setRoundKey] = useState<number>(0); // remounts tiles face-down on reset
    const sessionIdRef = useRef<string | null>(null);
    const roundRef = useRef(0); // bumps each round so a stale reveal animation can bail
    const gridRef = useRef<HTMLDivElement>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showNotification = (message: string, tone: "info" | "error" = "info") => {
        setNotification(message);
        setNotificationTone(tone);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setNotification(""), 3000);
    };

    // Whenever the primary button swaps in place (Place Bet ↔ Cash Out ↔ New Round),
    // hold it inert briefly so a double-click can't fire both actions.
    const armSwapGuard = () => {
        setSwapGuard(true);
        if (guardTimer.current) clearTimeout(guardTimer.current);
        guardTimer.current = setTimeout(() => setSwapGuard(false), SWAP_GUARD_MS);
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
                            setResumed(true);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to restore session:", err);
            } finally {
                // Only now is the board allowed to take clicks — no swallowed first tap.
                setHydrated(true);
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
            // Rejected bet: the idle board stays exactly as it was — no clearing.
            showNotification("Insufficient balance!", "error");
            return;
        }

        const mines = Math.max(1, Math.min(24, Math.floor(mineCount) || 3));
        setMineCount(mines);
        const initialBoard = generateBoard(mines);
        const { success, sessionId } = await startGameSession(amount, "MINES", {
            board: initialBoard,
            mineCount: mines,
        });
        if (!success) {
            // Board untouched — the idle tiles keep rendering.
            showNotification("Failed to place bet", "error");
            return;
        }
        if (sessionId) sessionIdRef.current = sessionId;

        roundRef.current += 1; // invalidate any still-running reveal from the prior round
        setRoundKey((k) => k + 1); // fresh face-down tiles, no flip-back artifacts
        setBoard(initialBoard);
        setStarted(true);
        setGameOver(false);
        setRevealedCount(0);
        setEarnings(amount);
        setMultiplier("1.00");
        setCashedOut(false);
        setResultReady(false);
        setKillerIndex(null);
        setResumed(false);
        setSpotlightIndex(null);
        armSwapGuard(); // Place Bet just became Cash Out — swallow a stray second click

        setTimeout(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    };

    const waveReveal = async (lastIndex: number) => {
        const myRound = roundRef.current;
        // Iterate fixed indices (not the board snapshot) so all 25 tiles always flip.
        const tilesWithDistance = Array.from({ length: TILE_COUNT }, (_, i) => ({
            index: i,
            dist: Math.sqrt(
                Math.pow(Math.floor(i / 5) - Math.floor(lastIndex / 5), 2) +
                Math.pow((i % 5) - (lastIndex % 5), 2)
            ),
        })).sort((a, b) => a.dist - b.dist);

        for (const item of tilesWithDistance) {
            if (roundRef.current !== myRound) return; // a new round started — stop animating the old board
            setBoard((prev) => {
                const next = [...prev];
                next[item.index] = { ...next[item.index], revealed: true };
                return next;
            });
            await sleep(40);
        }

        if (roundRef.current !== myRound) return;
        // Safety sweep: guarantee no tile is left face-down after the round ends.
        setBoard((prev) => prev.map((t) => (t.revealed ? t : { ...t, revealed: true })));
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
        if (!hydrated || resetting || cashingOut) return;
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
            setKillerIndex(index);
            // Settle the loss immediately (the reveal animation below takes ~1s);
            // otherwise a fast "New Round → Place Bet" hits a still-active session.
            const lostSession = sessionIdRef.current;
            sessionIdRef.current = null;
            if (lostSession) recordLoss(lostSession);

            const myRound = roundRef.current;
            // 1) Detonate the clicked tile first — the explosion is the headline.
            setBoard((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], revealed: true };
                return next;
            });
            await sleep(700);
            if (roundRef.current !== myRound) return;
            // 2) Then wash the rest of the board open.
            await waveReveal(index);
            if (roundRef.current !== myRound) return;
            await sleep(250);
            if (roundRef.current !== myRound) return;
            // 3) Only now does the BOOM panel land.
            setResultReady(true);
            armSwapGuard(); // Cash Out just became New Round
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

    const handleNewRound = () => {
        roundRef.current += 1; // kill any straggling reveal animation
        setRoundKey((k) => k + 1); // remount tiles as face-down frames — never bare gem outlines
        setResetting(true);
        setStarted(false);
        setGameOver(false);
        setCashedOut(false);
        setCashingOut(false);
        setResultReady(false);
        setKillerIndex(null);
        setResumed(false);
        setBoard([]);
        setMultiplier("1.00");
        setEarnings(0);
        setRevealedCount(0);
        armSwapGuard(); // New Round just became Place Bet
        setTimeout(() => setResetting(false), RESET_WINDOW_MS);
    };

    const handleCashOut = async () => {
        if (gameOver || cashedOut) {
            handleNewRound();
            return;
        }
        if (cashingOut || swapGuard || revealedCount === 0) return;

        // The server is the ledger: no Banked panel until it confirms the credit.
        setCashingOut(true);
        const credited = await recordWin(earnings, amount, "MINES", parseFloat(multiplier));
        if (!credited) {
            setCashingOut(false);
            showNotification("The house rejected that cash-out — try again.", "error");
            return; // round stays alive
        }
        sessionIdRef.current = null;
        showNotification(`Cashed out ₹${earnings.toFixed(2)}!`);
        gridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(300);
        setStarted(false);
        setCashedOut(true);
        setCashingOut(false);
        setResumed(false);
        armSwapGuard(); // Cash Out just became New Round
        await waveReveal(Math.floor(TILE_COUNT / 2));
    };

    const getThresholdHint = () => {
        const m = parseFloat(multiplier);
        if (m >= 2 && m < 5) return "Most players bank around 2–3×.";
        if (m >= 5 && m < 10) return "Risk climbs sharply past 5×.";
        if (m >= 10) return "Legend territory. Don't be greedy.";
        return revealedCount > 0 ? "Cash out now, or dig for more." : "Reveal a gem to start the climb.";
    };

    const idle = !started && !gameOver && !cashedOut;
    const playing = started && !gameOver && !cashedOut;
    const detonating = gameOver && !resultReady; // board explosion still playing out
    const boardReady = hydrated && !resetting;

    const cashOutDisabled = cashingOut || swapGuard || detonating || revealedCount === 0;
    const cashOutLabel = detonating
        ? `Cash Out ₹${earnings.toFixed(2)}`
        : cashingOut
            ? "Cashing Out…"
            : revealedCount === 0
                ? "Reveal a tile to unlock"
                : `Cash Out ₹${earnings.toFixed(2)}`;

    return (
        <>
            <Navbar />

            <main className="game-stage mines-page">
                <AnimatePresence>
                    {notification && (
                        <motion.div
                            className={`game-toast ${notificationTone === "error" ? "game-toast--error" : ""}`}
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
                        <div className="game-head__right">
                            <p className="game-sub">Flip gems, dodge the bombs, and bank it before the board blows.</p>
                            <HowToPlay game="mines" />
                        </div>
                    </header>

                    <div className="game-layout mines-layout">
                        {/* board */}
                        <div className={`game-board ${boardReady ? "" : "is-syncing"}`} ref={gridRef}>
                            <div className="mines-grid">
                                {[...Array(TILE_COUNT)].map((_, index) => (
                                    <Tile
                                        key={`${roundKey}-${index}`}
                                        tile={board[index] || { revealed: false, isMine: false }}
                                        onClick={() => revealTile(index)}
                                        disabled={gameOver || cashedOut || !started || spotlightIndex !== null || !boardReady || cashingOut}
                                        isDimmed={spotlightIndex !== null && spotlightIndex !== index}
                                        isSpotlight={spotlightIndex === index}
                                        isKiller={killerIndex === index}
                                    />
                                ))}
                            </div>
                            {!boardReady && <div className="mines-sync-hint">syncing…</div>}
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
                                            min={1}
                                            max={24}
                                            value={mineCount || ""}
                                            onChange={(e) => setMineCount(Number(e.target.value))}
                                        />
                                    </div>

                                    <button className="game-primary" type="submit" disabled={swapGuard}>Place Bet</button>
                                </form>
                            )}

                            {(playing || detonating) && (
                                <div className="game-live">
                                    {resumed && (
                                        <p className="mines-resume-note">
                                            Round in progress — resumed (₹{amount.toFixed(2)} staked)
                                        </p>
                                    )}
                                    <div className="game-stat game-stat--mult">
                                        <div className="game-stat__label">Multiplier</div>
                                        <div className="game-stat__value">{multiplier}×</div>
                                    </div>
                                    <div className="game-stat game-stat--pay">
                                        <div className="game-stat__label">Cash Out Value</div>
                                        <div className="game-stat__value">₹{earnings.toFixed(2)}</div>
                                    </div>
                                    <p className="game-hint">{getThresholdHint()}</p>
                                    <button className="game-cashout" onClick={handleCashOut} disabled={cashOutDisabled}>
                                        {cashOutLabel}
                                    </button>
                                </div>
                            )}

                            {((gameOver && resultReady) || cashedOut) && (
                                <div className="game-live">
                                    <div className={`mines-result ${gameOver ? "is-lost" : "is-won"}`}>
                                        <div className="mines-result__title">{gameOver ? "Boom." : "Banked."}</div>
                                        <div className="mines-result__sub">
                                            {gameOver
                                                ? `A mine caught you. The house keeps -₹${amount.toFixed(2)}.`
                                                : `You walked away with ₹${earnings.toFixed(2)}.`}
                                        </div>
                                    </div>
                                    <button className="game-clear" onClick={handleNewRound} disabled={swapGuard}>New Round</button>
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
