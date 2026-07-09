"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Tile from "./Tile";
import "../styles/Mines.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
import GameHeader from "./game/GameHeader";
import PendingButton from "./game/PendingButton";
import { useLeaveGuard } from "./game/LeaveGuard";
// NOTE: guided tutorial intentionally deferred — see ./tutorial/* (to be re-added later).

const TILE_COUNT = 25;
const MIN_BET = 1;
const MIN_MINES = 1;
const MAX_MINES = 24;
const SWAP_GUARD_MS = 600; // primary button is inert this long after it swaps state
const RESET_WINDOW_MS = 450; // board stays gated while a new round settles in

interface TileData {
    isMine: boolean;
    revealed: boolean;
}

/** Clamp a typed/derived mine count into the legal 1–24 range (empty → 3). */
const clampMines = (n: number): number =>
    Math.max(MIN_MINES, Math.min(MAX_MINES, Math.floor(n) || 3));

// Rules copy for the shared header's "? How to play" trigger — same content
// the old inline <HowToPlay game="mines" /> showed, now controlled by Mines.
const MINES_RULES = {
    title: "How to play Mines",
    steps: [
        "Set your bet and how many mines hide on the 5×5 board, then Place Bet.",
        "Flip tiles to find gems — every gem raises your multiplier.",
        "Cash out any time to bank bet × multiplier.",
        "Hit a mine and you lose the bet — so quit while you're ahead.",
    ],
    tip: "More mines = bigger multiplier per gem, but a higher chance of busting.",
};

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
    const [showRules, setShowRules] = useState<boolean>(false);
    const [placingBet, setPlacingBet] = useState<boolean>(false); // startGameSession in flight
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

    // Stepper for the mine count — a bare number input gave no cue it was
    // adjustable, so [−]/[+] nudge it while the middle stays typeable.
    const stepMines = (delta: number) =>
        setMineCount((c) => Math.max(MIN_MINES, Math.min(MAX_MINES, (Math.floor(c) || 3) + delta)));

    const startGame = async (e: React.FormEvent) => {
        e.preventDefault();
        if (placingBet) return;

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

        const mines = clampMines(mineCount);
        setMineCount(mines);
        const initialBoard = generateBoard(mines);
        // The hosted backend takes 1–3s to open the session — stage the board
        // and hold Place Bet in its pending state until the round is confirmed.
        setPlacingBet(true);
        const { success, sessionId } = await startGameSession(amount, "MINES", {
            board: initialBoard,
            mineCount: mines,
        });
        if (!success) {
            setPlacingBet(false);
            // Board untouched — the idle tiles keep rendering.
            showNotification("Failed to place bet", "error");
            return;
        }
        if (sessionId) sessionIdRef.current = sessionId;
        setPlacingBet(false);

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

    // Navigation guard while money is on the board (issue #15). `when` disarms
    // it on cash-out, boom, and unmount. "Save round & leave" needs no run():
    // the server session persists and the mount-time restore resumes it.
    useLeaveGuard({
        when: started && !gameOver && !cashedOut,
        title: "Leave mid-round?",
        message: `Your round stays open — come back and it resumes right where you left it. Or forfeit and the house keeps ₹${amount.toFixed(2)}.`,
        actions: [
            { label: "Stay", tone: "ghost", leave: false },
            { label: "Save round & leave", tone: "gold", leave: true },
            {
                label: "Forfeit & leave",
                tone: "ember",
                leave: true,
                run: async () => {
                    const sid = sessionIdRef.current;
                    if (!sid) return;
                    const settled = await recordLoss(sid);
                    // A refused forfeit must keep the player at the table —
                    // throwing makes the LeaveGuard cancel the navigation.
                    if (!settled) throw new Error("Forfeit rejected by the house");
                    sessionIdRef.current = null;
                    handleNewRound();
                },
            },
        ],
    });

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
    const cashOutLabel = !detonating && revealedCount === 0
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
                    <GameHeader
                        eyebrow={`PROVABLY FAIR · ${mineCount} MINES`}
                        title="MINES"
                        tagline="Flip gems, dodge the bombs, and bank it before the board blows."
                        onHowToPlay={() => setShowRules(true)}
                    />

                    <div className="game-layout mines-layout">
                        {/* board */}
                        <div className={`game-board ${boardReady ? "" : "is-syncing"}${placingBet ? " is-staging" : ""}`} ref={gridRef}>
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
                            {placingBet && <p className="staging-note">The house is dealing…</p>}
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
                                            disabled={placingBet}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                        />
                                        <div className="game-adjust">
                                            <button type="button" disabled={placingBet} onClick={() => setAmount(Math.max(MIN_BET, Math.floor(amount / 2)))}>½</button>
                                            <button type="button" disabled={placingBet} onClick={() => setAmount(Math.min(wallet || amount * 2, amount * 2))}>2×</button>
                                        </div>
                                    </div>

                                    <div className="game-field">
                                        <label className="game-label">Mines (1–24)</label>
                                        <div className="mines-stepper">
                                            <button
                                                type="button"
                                                className="mines-stepper__btn"
                                                onClick={() => stepMines(-1)}
                                                disabled={placingBet || mineCount <= MIN_MINES}
                                                aria-label="Fewer mines"
                                            >−</button>
                                            <input
                                                className="game-input mines-stepper__input"
                                                type="number"
                                                min={MIN_MINES}
                                                max={MAX_MINES}
                                                value={mineCount || ""}
                                                disabled={placingBet}
                                                onChange={(e) => setMineCount(Number(e.target.value))}
                                                onBlur={() => setMineCount(clampMines(mineCount))}
                                            />
                                            <button
                                                type="button"
                                                className="mines-stepper__btn"
                                                onClick={() => stepMines(1)}
                                                disabled={placingBet || mineCount >= MAX_MINES}
                                                aria-label="More mines"
                                            >+</button>
                                        </div>
                                    </div>

                                    <PendingButton pending={placingBet} pendingLabel="PLACING BET…" type="submit" disabled={swapGuard}>
                                        Place Bet
                                    </PendingButton>
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
                                    <button className="game-cashout" onClick={handleCashOut} disabled={cashOutDisabled} aria-busy={cashingOut}>
                                        {cashingOut ? (
                                            <span className="gp-pending">
                                                <span className="gp-spinner" aria-hidden="true" />
                                                Cashing Out…
                                            </span>
                                        ) : (
                                            cashOutLabel
                                        )}
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

            {/* How-to-play modal, opened from the shared GameHeader trigger.
                Reuses the global .howto-* modal styles (globals.css). */}
            {showRules && (
                <div className="howto-overlay" onClick={() => setShowRules(false)}>
                    <div className="howto-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="howto-close" onClick={() => setShowRules(false)} aria-label="Close"><X size={18} /></button>
                        <h3 className="howto-title">{MINES_RULES.title}</h3>
                        <ol className="howto-steps">
                            {MINES_RULES.steps.map((s, i) => (
                                <li key={i}><span className="howto-num">{i + 1}</span>{s}</li>
                            ))}
                        </ol>
                        <p className="howto-tip"><strong>Tip:</strong> {MINES_RULES.tip}</p>
                    </div>
                </div>
            )}
        </>
    );
}
