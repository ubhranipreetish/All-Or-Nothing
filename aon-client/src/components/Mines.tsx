"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Tile from "./Tile";
import "../styles/Mines.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";

const TILE_COUNT = 25;
const MIN_BET = 1;

interface TileData {
    isMine: boolean;
    revealed: boolean;
}

// Tutorial step definitions
interface TutorialStep {
    id: string;
    title: string;
    message: string;
    action: string;
    highlight: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: "welcome",
        title: "Welcome to Mines!",
        message: "Let's learn how to play this exciting game.",
        action: "start-button", // Special: shows Start button
        highlight: "",
    },
    {
        id: "bet-amount",
        title: "Step 1: Bet Amount",
        message: "This is where you enter how much you want to bet.",
        action: "Click on the Bet Amount input",
        highlight: "bet-amount-input",
    },
    {
        id: "half-double",
        title: "Quick Adjust Buttons",
        message: "Use these to quickly halve (½) or double (2x) your bet.",
        action: "Click on the ½ button",
        highlight: "half-btn",
    },
    {
        id: "mine-count",
        title: "Step 2: Mine Count",
        message: "More mines = higher multiplier, but higher risk! Start with 3-5 mines.",
        action: "Click on the Mines input",
        highlight: "mine-count-input",
    },
    {
        id: "start-game",
        title: "Step 3: Start Playing",
        message: "Click Bet to start the game. Your bet is deducted from your wallet.",
        action: "Click the Bet button",
        highlight: "bet-button",
    },
    {
        id: "reveal-tile",
        title: "Step 4: Reveal Tiles",
        message: "Click on tiles to reveal them. Find gems 💎, avoid mines 💣!",
        action: "Click on the glowing tile",
        highlight: "tutorial-tile",
    },
    {
        id: "multiplier-info",
        title: "Step 5: Multiplier",
        message: "Each safe tile increases your multiplier. This shows how much you'll win!",
        action: "Click on the multiplier display",
        highlight: "multiplier-capsule",
    },
    {
        id: "cashout",
        title: "Step 6: Cash Out",
        message: "Click Cash Out anytime to secure your winnings. Don't get too greedy!",
        action: "Click the Cash Out button",
        highlight: "cashout-button",
    },
    {
        id: "complete",
        title: "You're Ready! 🎉",
        message: "That's it! Now try a real game. Good luck!",
        action: "start-button", // Special: shows Start Playing button
        highlight: "",
    },
];

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

// Generate a controlled tutorial board (safe tile at index 12 - center)
const generateTutorialBoard = (): TileData[] => {
    const board: TileData[] = Array.from({ length: TILE_COUNT }, () => ({
        isMine: false,
        revealed: false,
    }));
    const minePositions = [0, 4, 6, 18, 24];
    minePositions.forEach(pos => {
        board[pos] = { ...board[pos], isMine: true };
    });
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

    // Tutorial state
    const [isTutorialActive, setIsTutorialActive] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(0);

    const gridRef = useRef<HTMLDivElement>(null);

    const showNotification = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(""), 3000);
    };

    // Get current tutorial step
    const currentTutorialStep = isTutorialActive ? TUTORIAL_STEPS[tutorialStep] : null;

    // Start Tutorial
    const startTutorial = useCallback(() => {
        setIsTutorialActive(true);
        setTutorialStep(0);
        setStarted(false);
        setGameOver(false);
        setCashedOut(false);
        setBoard([]);
        setAmount(100);
        setMineCount(5);
        setMultiplier("1.00");
        setEarnings(0);
        setRevealedCount(0);
    }, []);

    // End tutorial
    const endTutorial = useCallback(() => {
        setIsTutorialActive(false);
        setTutorialStep(0);
        setStarted(false);
        setBoard([]);
        setMultiplier("1.00");
        setEarnings(0);
    }, []);

    // Advance to next tutorial step
    const nextTutorialStep = useCallback(() => {
        if (tutorialStep < TUTORIAL_STEPS.length - 1) {
            setTutorialStep(prev => prev + 1);
        } else {
            endTutorial();
        }
    }, [tutorialStep, endTutorial]);

    // Check if current step matches the clicked element
    const isTutorialTarget = useCallback((elementId: string) => {
        if (!isTutorialActive || !currentTutorialStep) return false;
        return currentTutorialStep.highlight === elementId;
    }, [isTutorialActive, currentTutorialStep]);

    // Handle tutorial element click - returns true if tutorial handled it
    const handleTutorialClick = useCallback((elementId: string) => {
        if (!isTutorialActive) return false;

        if (isTutorialTarget(elementId)) {
            nextTutorialStep();
            return true;
        }

        return false;
    }, [isTutorialActive, isTutorialTarget, nextTutorialStep]);

    // Setup demo board when reaching reveal-tile step
    useEffect(() => {
        if (!isTutorialActive) return;

        const step = TUTORIAL_STEPS[tutorialStep];

        if (step.id === "reveal-tile" && board.length === 0) {
            setBoard(generateTutorialBoard());
            setStarted(true);
            setEarnings(100);
        }
    }, [isTutorialActive, tutorialStep, board.length]);

    const startGame = async (e: React.FormEvent) => {
        e.preventDefault();

        // Handle tutorial bet button
        if (isTutorialActive && isTutorialTarget("bet-button")) {
            nextTutorialStep();
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
        let mult = 1;
        for (let i = 0; i < revealed; i++) {
            mult *= (totalTiles - i) / (safeTiles - i);
        }
        return mult * 0.96;
    };

    const revealTile = async (index: number) => {
        // Handle tutorial tile click (center tile = index 12)
        if (isTutorialActive && currentTutorialStep?.id === "reveal-tile" && index === 12) {
            if (gemSound.current) {
                gemSound.current.currentTime = 0;
                gemSound.current.play().catch(() => { });
            }

            setBoard(prev => {
                const next = [...prev];
                next[12] = { ...next[12], revealed: true };
                return next;
            });
            setRevealedCount(1);
            setMultiplier("1.20");
            setEarnings(120);

            setTimeout(() => nextTutorialStep(), 600);
            return;
        }

        if (!started || board[index]?.revealed || gameOver || cashedOut) return;

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
        // Handle tutorial cashout
        if (isTutorialActive && isTutorialTarget("cashout-button")) {
            nextTutorialStep();
            return;
        }

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

        gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

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

    // Check if element should be highlighted
    const isHighlighted = (elementId: string) => {
        return isTutorialActive && currentTutorialStep?.highlight === elementId;
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

                {/* Tutorial Button */}
                <button
                    className="tutorial-trigger-btn"
                    onClick={startTutorial}
                    disabled={started && !gameOver && !cashedOut}
                >
                    🎮 How to Play
                </button>

                {/* Tutorial Backdrop */}
                <AnimatePresence>
                    {isTutorialActive && (
                        <motion.div
                            className="tutorial-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                // Allow advancing on steps without specific targets
                                if (!currentTutorialStep?.highlight) {
                                    nextTutorialStep();
                                }
                            }}
                        />
                    )}
                </AnimatePresence>

                {/* Main game area - elevated during tutorial */}
                <div className={`main-layout1 ${isTutorialActive ? 'tutorial-active' : ''}`}>
                    <div className="right-navbar1">
                        <form onSubmit={startGame}>
                            <label className="input-label">Bet Amount</label>
                            <div
                                className={isHighlighted("bet-amount-input") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => {
                                    if (handleTutorialClick("bet-amount-input")) return;
                                }}
                            >
                                <input
                                    id="bet-amount-input"
                                    type="number"
                                    value={amount || ""}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    disabled={(started && !gameOver && !cashedOut) && !isTutorialActive}
                                />
                            </div>

                            <div className="half-double">
                                <button
                                    id="half-btn"
                                    className={isHighlighted("half-btn") ? "tutorial-highlight-wrapper" : ""}
                                    type="button"
                                    onClick={() => {
                                        if (handleTutorialClick("half-btn")) return;
                                        setAmount(Math.max(MIN_BET, amount / 2));
                                    }}
                                    disabled={started && !isTutorialActive}
                                >
                                    ½
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAmount(Math.min(wallet, amount * 2))}
                                    disabled={started || isTutorialActive}
                                >
                                    2x
                                </button>
                            </div>

                            <label className="input-label">Mines</label>
                            <div
                                className={isHighlighted("mine-count-input") ? "tutorial-highlight-wrapper" : ""}
                                onClick={() => {
                                    if (handleTutorialClick("mine-count-input")) return;
                                }}
                            >
                                <input
                                    id="mine-count-input"
                                    type="number"
                                    value={mineCount}
                                    onChange={(e) => setMineCount(Math.max(1, Math.min(24, Number(e.target.value))))}
                                    disabled={started && !isTutorialActive}
                                />
                            </div>

                            {!started || gameOver || cashedOut ? (
                                <button
                                    id="bet-button"
                                    className={isHighlighted("bet-button") ? "tutorial-highlight-wrapper" : ""}
                                    type="submit"
                                >
                                    Bet
                                </button>
                            ) : (
                                <div className="earnings-display1">
                                    <div
                                        id="multiplier-capsule"
                                        className={`stat-capsule ${isHighlighted("multiplier-capsule") ? "tutorial-highlight-wrapper" : ""}`}
                                        onClick={() => handleTutorialClick("multiplier-capsule")}
                                    >
                                        <span className="stat-label">Current Multiplier</span>
                                        <div className="stat-value">{multiplier}x</div>
                                    </div>

                                    <div className="stat-capsule cashout-capsule">
                                        <span className="stat-label">Cash Out Amount</span>
                                        <div className="stat-value">₹{earnings.toFixed(2)}</div>
                                    </div>

                                    {getThresholdHint() && <div className="threshold-hint">{getThresholdHint()}</div>}

                                    <button
                                        id="cashout-button"
                                        className={`cashout-btn ${isHighlighted("cashout-button") ? "tutorial-highlight-wrapper" : ""}`}
                                        onClick={handleCashOut}
                                        type="button"
                                    >
                                        Cash Out
                                    </button>
                                </div>
                            )}

                            {(gameOver || cashedOut) && !isTutorialActive && (
                                <button id="bet1" onClick={handleCashOut} type="button" style={{ background: 'var(--divider)', color: 'white', marginTop: '1rem' }}>
                                    Clear Table
                                </button>
                            )}
                        </form>
                    </div>

                    <div className="container1" ref={gridRef}>
                        {[...Array(TILE_COUNT)].map((_, index) => {
                            const isTutorialTile = isTutorialActive &&
                                currentTutorialStep?.id === "reveal-tile" &&
                                index === 12;

                            return (
                                <Tile
                                    key={index}
                                    tile={board[index] || { revealed: false, isMine: false }}
                                    onClick={() => revealTile(index)}
                                    disabled={
                                        (gameOver || cashedOut || !started || spotlightIndex !== null) &&
                                        !isTutorialTile
                                    }
                                    isDimmed={
                                        (spotlightIndex !== null && spotlightIndex !== index) ||
                                        (isTutorialActive && currentTutorialStep?.id === "reveal-tile" && index !== 12)
                                    }
                                    isSpotlight={spotlightIndex === index || isTutorialTile}
                                    className={isTutorialTile ? "tutorial-highlight-wrapper" : ""}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Tutorial Tooltip - always visible above everything */}
                <AnimatePresence>
                    {isTutorialActive && currentTutorialStep && (
                        <motion.div
                            className="tutorial-tooltip"
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            key={tutorialStep}
                        >
                            <div className="tutorial-step-indicator">
                                Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}
                            </div>
                            <h3 className="tutorial-title">{currentTutorialStep.title}</h3>
                            <p className="tutorial-message">{currentTutorialStep.message}</p>

                            {/* Show start button for welcome/complete steps, otherwise show action text */}
                            {currentTutorialStep.action === "start-button" ? (
                                <button
                                    className="tutorial-start-btn"
                                    onClick={() => {
                                        if (currentTutorialStep.id === "complete") {
                                            endTutorial();
                                        } else {
                                            nextTutorialStep();
                                        }
                                    }}
                                >
                                    {currentTutorialStep.id === "complete" ? "Start Playing" : "Start Tutorial"}
                                </button>
                            ) : (
                                <p className="tutorial-action">{currentTutorialStep.action}</p>
                            )}

                            <button
                                className="tutorial-skip-btn"
                                onClick={endTutorial}
                            >
                                Skip Tutorial
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <Footer />
            <SignInDialog isOpen={showSignInDialog} onClose={() => setShowSignInDialog(false)} />
        </>
    );
}
