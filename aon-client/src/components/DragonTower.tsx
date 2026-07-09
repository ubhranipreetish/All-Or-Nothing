"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Coins, ChevronUp, X } from "lucide-react";
import "../styles/DragonTower.css";
import Navbar from "./Navbar";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import Footer from "./Footer";
import SignInDialog from "./SignInDialog";
import GameHeader from "./game/GameHeader";
import PendingButton from "./game/PendingButton";
import { useLeaveGuard } from "./game/LeaveGuard";
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

const DRAGON_RULES = [
    "Set your bet and difficulty, then Place Bet.",
    "On each floor, pick one stone — a safe stone lets you climb and grows your multiplier.",
    "Cash out any time to bank your winnings.",
    "Pick the dragon's tile and the climb ends — you lose the bet.",
];

/* --------------------------------------------------------------------
   Art direction: "THE KEEP". Stake-style composition, AON palette: the
   grid sits inside a stone tower frame (CSS masonry walls on the left/
   right/bottom, an SVG crenellated battlement on top) and a flat-vector
   dragon peers over the battlement — head BEHIND the wall, two clawed
   hands hooked OVER it. The ember eyes are the focal point: they blink,
   breathe, flare on climbs; the whole dragon rises on a hit and sinks
   behind the wall on cash-out. All decoration is pointer-events:none;
   tile hit areas are untouched. Classes live in DragonTower.css
   (.dt-lair / .dt-dragon* / .dt-keep / .dt-wall*).
   -------------------------------------------------------------------- */

/* battlement geometry (svg user units, viewBox 0 0 700 200):
   wall base y158..200, merlons y134..160; the head sits in the wide
   central crenel, claw merlons center on x=174 and x=526 */
const MERLONS = [
    [0, 30], [63, 46], [151, 46], [239, 46], [415, 46], [503, 46], [591, 46], [670, 30],
] as const;

/* one clawed hand gripping the merlon at x=151..197 — a paw mass wider
   than the merlon (x=138..208) plus three chunky wedge fingers wrapping
   down over the wall face, short ember talon tips, gold knuckle rims;
   the right hand reuses this mirrored about the board center */
const ClawShape = () => (
    <>
        {/* hand mass arcing over the wall top — clearly overlaps the merlon */}
        <polygon className="dt-paw" points="138,138 146,112 174,104 200,112 208,138" />
        {/* three chunky wedge fingers over the stone face */}
        <polygon className="dt-paw" points="142,140 145,122 152,117 159,122 162,140 162,156 152,168 142,156" />
        <polygon className="dt-paw" points="164,140 167,120 174,115 181,120 184,140 184,162 174,176 164,162" />
        <polygon className="dt-paw" points="186,140 189,122 196,118 203,123 206,140 206,152 196,164 186,152" />
        {/* short ember talon tips (small relative to the fingers) */}
        <polygon className="dt-talon" points="146,158 158,158 152,168" />
        <polygon className="dt-talon" points="168,164 180,164 174,176" />
        <polygon className="dt-talon" points="190,154 202,154 196,164" />
        {/* gold rim-light on the knuckle tops */}
        <path className="dt-rim dt-rim--thin" d="M145 122 L152 117 L159 122" />
        <path className="dt-rim dt-rim--thin" d="M167 120 L174 115 L181 120" />
        <path className="dt-rim dt-rim--thin" d="M189 122 L196 118 L203 123" />
    </>
);

export default function DragonTower() {
    // Server-authoritative: the client never generates or knows dragon positions.
    // It only names the tile it picks (dragonReveal) and renders what the server
    // returns — the multiplier on a safe climb, the full dragon layout on a hit.
    const { wallet, startGameSession, dragonReveal, cashOutGame, refundBet, recordLoss } = useWallet();
    const { user } = useAuth();
    const [showSignInDialog, setShowSignInDialog] = useState(false);

    const [difficulty, setDifficulty] = useState<DifficultyLevel>("Low");
    // `dragons` holds the full per-row dragon layout ONLY after a hit (from the
    // server reveal) — it is empty during live play and on cash-out.
    const [dragons, setDragons] = useState<number[]>([]);
    // `selected` = the safe tile index chosen on each completed floor. Its length
    // is the current floor; the active row is always row === selected.length.
    const [selected, setSelected] = useState<number[]>([]);
    const [gameOver, setGameOver] = useState<boolean>(false);
    const [cashOut, setCashOut] = useState<boolean>(false);
    const [amount, setAmount] = useState<number>(100);
    const [started, setStarted] = useState<boolean>(false);
    const [notification, setNotification] = useState<string>("");
    const [notifTone, setNotifTone] = useState<"gold" | "ember">("gold");
    const [revealedRows, setRevealedRows] = useState<number[]>([]);
    const [multiplierPop, setMultiplierPop] = useState<boolean>(false);
    // Displayed multiplier — a SERVER value only. 1 at floor 0, then whatever the
    // reveal response reports on each safe climb. Never computed on the client.
    const [multiplier, setMultiplier] = useState<number>(1);
    const [maxed, setMaxed] = useState<boolean>(false); // floor 10 topped out
    const [resumed, setResumed] = useState<boolean>(false); // restored from /game/active
    // The row whose reveal is in flight — its tiles are inert during the call.
    const [pendingRow, setPendingRow] = useState<number | null>(null);
    // Round sequencing: tower stays disabled until the round is ready to take
    // clicks; the cash-out request is in flight; the win verdict is banked;
    // the loss verdict waits for the dragon reveal to finish.
    const [boardReady, setBoardReady] = useState<boolean>(false);
    const [cashingOut, setCashingOut] = useState<boolean>(false);
    const [banked, setBanked] = useState<boolean>(false);
    const [bankedAmount, setBankedAmount] = useState<number>(0);
    const [lossRevealed, setLossRevealed] = useState<boolean>(false);
    const [placingBet, setPlacingBet] = useState<boolean>(false);
    const [showRules, setShowRules] = useState<boolean>(false);
    const [lairPulse, setLairPulse] = useState<boolean>(false);
    const prevSelectedLength = useRef<number>(0);
    const towerRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef<string | null>(null);

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

    // Multiplier pop + lair pulse (eye brightens, seams flare) on progress.
    useEffect(() => {
        if (selected.length > prevSelectedLength.current && selected.length > 0) {
            setMultiplierPop(true);
            setLairPulse(true);
            const popTimer = setTimeout(() => setMultiplierPop(false), 150);
            const pulseTimer = setTimeout(() => setLairPulse(false), 750);
            return () => {
                clearTimeout(popTimer);
                clearTimeout(pulseTimer);
            };
        }
        prevSelectedLength.current = selected.length;
    }, [selected.length]);

    // Restore an in-flight climb on mount. The server never returns dragon
    // positions here — only the floor reached, the safe picks per completed
    // floor, and the current multiplier — so a resumed round is just as blind
    // to the dragons as a fresh one.
    useEffect(() => {
        const restore = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"}/game/active?gameType=DRAGON_TOWER`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!data.active) return;
                sessionIdRef.current = data.sessionId;
                setAmount(data.betAmount);
                setMultiplier(data.multiplier ?? 1);
                if (data.gameConfig?.difficulty) setDifficulty(data.gameConfig.difficulty as DifficultyLevel);
                const picks: number[] = Array.isArray(data.revealed) ? data.revealed : [];
                setSelected(picks);
                prevSelectedLength.current = picks.length;
                setDragons([]);
                setGameOver(false);
                setCashOut(false);
                setBanked(false);
                setLossRevealed(false);
                setMaxed(picks.length >= ROWS);
                setStarted(true);
                setResumed(true);
            } catch (err) {
                console.error("Failed to restore Dragon Tower session:", err);
            }
        };
        restore();
    }, []);

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
        setMultiplier(1);
        setMaxed(false);
        setResumed(false);
        setPendingRow(null);
        sessionIdRef.current = null;
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

        // The server owns the dragon layout for this session — the client only
        // hands it the chosen difficulty and gets back a session id.
        setPlacingBet(true);
        const { success, sessionId } = await startGameSession(amount, "DRAGON_TOWER", { difficulty });
        setPlacingBet(false);
        if (!success) {
            showNotification("Failed to place bet", "ember");
            return;
        }
        sessionIdRef.current = sessionId ?? null;

        setDragons([]);
        setSelected([]);
        setRevealedRows([]);
        setMultiplier(1);
        setMaxed(false);
        setResumed(false);
        setPendingRow(null);
        setGameOver(false);
        setCashOut(false);
        setBanked(false);
        setLossRevealed(false);
        setCashingOut(false);
        setStarted(true);
        prevSelectedLength.current = 0;
        setTimeout(() => towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    };

    const handleTileClick = async (row: number, index: number) => {
        if (!started || !boardReady || gameOver || cashOut || cashingOut) return;
        if (selected.length !== row || pendingRow !== null) return;
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;

        setPendingRow(row);
        const response = await dragonReveal(sessionId, index);
        setPendingRow(null);

        if (!response) {
            showNotification("The climb stalled — try that stone again.", "ember");
            return;
        }

        if (response.hit) {
            // The picked tile was the dragon. The server already settled the loss
            // and hands back the full layout for the reveal — no recordLoss here.
            sessionIdRef.current = null;
            setDragons(response.dragons ?? []);
            setMultiplier(0);
            setMaxed(false);
            setGameOver(true);
            return;
        }

        // Safe climb — advance using the server's floor + multiplier only.
        setSelected((prev) => [...prev, index]);
        if (typeof response.multiplier === "number") setMultiplier(response.multiplier);
        if (response.maxed) setMaxed(true);
    };

    // Earnings are always bet × the SERVER multiplier — never a client formula.
    const earnings = parseFloat((amount * multiplier).toFixed(2));
    const multiplierLabel = (gameOver ? 0 : multiplier).toFixed(2);

    // Navigation guard while a climb is live (bet placed, not yet banked or
    // torched). Floor 0 offers a clean stake refund; mid-climb offers the
    // same bank / forfeit choice as the side panel. A torched climb needs no
    // settle call — the stake was already taken when the bet was placed.
    useLeaveGuard({
        when: started && !gameOver && !cashOut,
        title: "Leave the tower?",
        message:
            selected.length > 0
                ? `Bank your current ₹${earnings.toFixed(2)} at ${multiplierLabel}× or forfeit the stake — the dragon doesn't hold seats.`
                : "You haven't climbed yet — take the stake back before you go.",
        actions:
            selected.length > 0
                ? [
                      { label: "Stay", tone: "ghost", leave: false },
                      {
                          label: `Bank ₹${earnings.toFixed(2)} & leave`,
                          tone: "gold",
                          leave: true,
                          run: async () => {
                              const sid = sessionIdRef.current;
                              if (!sid) return;
                              const res = await cashOutGame(sid);
                              if (!res) throw new Error("Cash out failed — the round is still live.");
                              sessionIdRef.current = null;
                          },
                      },
                      {
                          label: "Forfeit & leave",
                          tone: "ember",
                          leave: true,
                          run: async () => {
                              const sid = sessionIdRef.current;
                              if (!sid) return;
                              const ok = await recordLoss(sid);
                              if (!ok) throw new Error("Forfeit failed — the round is still live.");
                              sessionIdRef.current = null;
                          },
                      },
                  ]
                : [
                      { label: "Stay", tone: "ghost", leave: false },
                      {
                          label: "Refund stake & leave",
                          tone: "gold",
                          leave: true,
                          run: async () => {
                              const ok = await refundBet("DRAGON_TOWER", sessionIdRef.current ?? undefined);
                              if (!ok) throw new Error("Refund failed — the round is still live.");
                              sessionIdRef.current = null;
                          },
                      },
                  ],
    });

    const handleCashOut = async () => {
        // Cash-out is climbed-only — the button stays disabled at floor 0, where a
        // clean stake refund is offered through the leave-guard instead.
        if (!started || gameOver || cashOut || cashingOut || selected.length === 0) return;
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;

        setCashingOut(true);
        towerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

        const response = await cashOutGame(sessionId);
        setCashingOut(false);
        if (!response) {
            showNotification("Cash out failed — the round is still live. Try again.", "ember");
            return;
        }
        sessionIdRef.current = null;
        setBankedAmount(response.winAmount);
        setCashOut(true); // dragon sinks behind the wall; only the climbed picks stay lit
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
                    <GameHeader
                        eyebrow={difficultyLabels[difficulty]}
                        title="DRAGON"
                        titleAccent="tower"
                        tagline="Pick a safe stone each floor. One dragon ends the climb."
                        onHowToPlay={() => setShowRules(true)}
                    />

                    <div className="game-layout">
                        {/* the lair: the dragon looms above the tower it guards */}
                        <div className={`game-board ${placingBet ? "is-staging" : ""}`}>
                            <div
                                className={`dt-lair ${lairPulse ? "is-pulse" : ""} ${gameOver ? "is-bite" : ""} ${banked || cashOut ? "is-dimmed" : ""}`}
                            >
                                {/* the battlement crown: flat-vector dragon peeking over the
                                    top wall. Paint order = z-order: wings/horns/head (behind
                                    the wall) -> stone wall strip -> claws + fangs (hooked over
                                    the front). Both dragon groups share .dt-dragon__rig so
                                    reactions move them as one body. */}
                                <svg
                                    className="dt-dragon"
                                    viewBox="0 0 700 200"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <defs>
                                        <radialGradient id="dtEyeFire" cx="50%" cy="42%" r="65%">
                                            <stop offset="0%" stopColor="#FFD877" />
                                            <stop offset="52%" stopColor="#ff4438" />
                                            <stop offset="100%" stopColor="#8a1f14" />
                                        </radialGradient>
                                        <filter id="dtEyeGlow" x="-120%" y="-120%" width="340%" height="340%">
                                            <feGaussianBlur stdDeviation="7" />
                                        </filter>
                                        {/* obsidian masonry for the wall base: staggered courses,
                                            gold-tinted mortar, per-block top highlight */}
                                        <pattern id="dtMasonry" width="88" height="24" patternUnits="userSpaceOnUse">
                                            <rect width="88" height="24" fill="#16121d" />
                                            <rect y="11" width="88" height="13" fill="#181322" />
                                            <rect width="88" height="1" fill="rgba(233,185,73,0.10)" />
                                            <rect y="1" width="88" height="1" fill="rgba(255,255,255,0.045)" />
                                            <rect y="11" width="88" height="1" fill="rgba(233,185,73,0.10)" />
                                            <rect y="12" width="88" height="1" fill="rgba(255,255,255,0.03)" />
                                            <rect x="43" width="1" height="11" fill="rgba(233,185,73,0.08)" />
                                            <rect x="87" y="12" width="1" height="12" fill="rgba(233,185,73,0.08)" />
                                        </pattern>
                                    </defs>

                                    {/* aft rig: everything BEHIND the wall */}
                                    <g className="dt-dragon__rig">
                                        {/* wing-spike silhouettes, lowest contrast */}
                                        <g className="dt-dragon__wings">
                                            <path d="M268 158 L150 52 L184 120 L120 104 L196 158 Z" />
                                            <path d="M432 158 L550 52 L516 120 L580 104 L504 158 Z" />
                                        </g>
                                        {/* swept-back horns (asymmetric) with darker inner faces,
                                            plus a smaller secondary pair */}
                                        <g className="dt-dragon__horns">
                                            <path className="dt-horn" d="M306 76 L214 14 L236 4 L262 34 L324 60 Z" />
                                            <path className="dt-horn" d="M394 78 L478 22 L458 8 L434 36 L376 60 Z" />
                                            <path className="dt-facet" d="M306 76 L214 14 L258 42 Z" />
                                            <path className="dt-facet" d="M394 78 L478 22 L436 44 Z" />
                                            {/* lit slivers along the horn top edges — the flat-art
                                                rim-light that makes the silhouette read */}
                                            <path className="dt-hornlit" d="M236 4 L262 34 L324 60 L316 53 L263 27 L243 7 Z" />
                                            <path className="dt-hornlit" d="M458 8 L434 36 L376 60 L384 54 L432 30 L451 10 Z" />
                                            <path className="dt-horn2" d="M322 60 L288 20 L306 14 L340 52 Z" />
                                            <path className="dt-horn2" d="M378 60 L410 22 L394 16 L360 52 Z" />
                                            {/* single gold accent hugging the left horn's top edge */}
                                            <path className="dt-rim" d="M292 46 L262 34 L236 4" />
                                        </g>
                                        {/* wedge skull */}
                                        <path
                                            className="dt-dragon__skull"
                                            d="M350 30 L296 46 L258 78 L238 116 L262 140 L306 162 L350 176 L394 162 L438 140 L462 116 L442 78 L404 46 Z"
                                        />
                                        {/* flat facet planes: crest + snout ridge catch the light
                                            (anchor the gold accent), cheek planes fall to shadow */}
                                        <g className="dt-dragon__facets">
                                            <path className="dt-crest" d="M350 30 L322 54 L350 66 L378 54 Z" />
                                            <path className="dt-crest" d="M350 66 L336 118 L350 132 L364 118 Z" />
                                            <path className="dt-facet" d="M238 116 L258 96 L290 126 L262 138 Z" />
                                            <path className="dt-facet" d="M462 116 L442 96 L410 126 L438 138 Z" />
                                        </g>
                                        {/* short gold accent on the crest peak */}
                                        <path className="dt-rim" d="M322 38 L350 30 L378 38" />
                                        {/* THE EYES — angry slanted kite/almond irises (sharp outer
                                            points tilted UP toward the horns, wide inner corners) on
                                            darker sockets, ember gradient + slit pupils, glow behind */}
                                        <g className="dt-dragon__eyes">
                                            <ellipse className="dt-dragon__glow" cx="288" cy="103" rx="26" ry="16" filter="url(#dtEyeGlow)" />
                                            <ellipse className="dt-dragon__glow" cx="412" cy="103" rx="26" ry="16" filter="url(#dtEyeGlow)" />
                                            <g className="dt-dragon__eye">
                                                <polygon className="dt-socket" points="263,91 292,92 311,103 306,116 276,115" />
                                                <polygon fill="url(#dtEyeFire)" points="268,94 290,95 306,104 302,112 280,111" />
                                                <polygon className="dt-pupil" points="286,96 290,96 291,111 285,110" />
                                            </g>
                                            <g className="dt-dragon__eye">
                                                <polygon className="dt-socket" points="437,91 408,92 389,103 394,116 424,115" />
                                                <polygon fill="url(#dtEyeFire)" points="432,94 410,95 394,104 398,112 420,111" />
                                                <polygon className="dt-pupil" points="414,96 410,96 409,111 415,110" />
                                            </g>
                                        </g>
                                        {/* brow plates — angled ANGRY (inner ends lower than outer),
                                            overhanging so the eye tops fall into shadow */}
                                        <g className="dt-dragon__brows">
                                            <polygon points="256,86 318,98 314,108 296,100 260,97" />
                                            <polygon points="444,86 382,98 386,108 404,100 440,97" />
                                        </g>
                                        {/* snout tip resting on the wall edge (anchors the fangs) +
                                            slit nostrils with faint ember dots */}
                                        <g className="dt-dragon__nostrils">
                                            <path className="dt-snout" d="M330 144 L370 144 L366 160 L334 160 Z" />
                                            <polygon className="dt-socket" points="334,138 339,136 340,150 335,151" />
                                            <polygon className="dt-socket" points="366,138 361,136 360,150 365,151" />
                                            <circle cx="337.5" cy="149" r="1.8" fill="#ff6a3c" opacity="0.55" />
                                            <circle cx="362.5" cy="149" r="1.8" fill="#ff6a3c" opacity="0.55" />
                                        </g>
                                    </g>

                                    {/* crenellated top wall — covers the dragon's jaw/neck */}
                                    <g className="dt-wall-top">
                                        <rect x="0" y="158" width="700" height="42" fill="url(#dtMasonry)" />
                                        {MERLONS.map(([x, w]) => (
                                            <g key={x}>
                                                <rect x={x} y={134} width={w} height={26} fill="#221a30" />
                                                <rect x={x} y={134} width={w} height={1.5} fill="rgba(233,185,73,0.14)" />
                                                <rect x={x} y={135.5} width={w} height={1} fill="rgba(255,255,255,0.05)" />
                                            </g>
                                        ))}
                                    </g>

                                    {/* fore rig: claws + fangs hooked OVER the wall front */}
                                    <g className="dt-dragon__rig dt-dragon__fore">
                                        <g className="dt-dragon__claw">
                                            <ClawShape />
                                        </g>
                                        {/* right hand: same shape mirrored about the board center */}
                                        <g transform="matrix(-1 0 0 1 700 0)">
                                            <g className="dt-dragon__claw">
                                                <ClawShape />
                                            </g>
                                        </g>
                                        {/* fangs hooked over the wall line, anchored to the snout tip */}
                                        <g className="dt-dragon__fangs">
                                            <polygon points="332,152 342,152 337,166" />
                                            <polygon points="358,152 368,152 363,166" />
                                        </g>
                                    </g>
                                </svg>

                                {/* the keep: masonry walls framing the grid */}
                                <div className="dt-keep">
                                    <span className="dt-wall dt-wall--left" aria-hidden="true" />
                                    <span className="dt-wall dt-wall--right" aria-hidden="true" />
                                    <span className="dt-wall dt-wall--bottom" aria-hidden="true" />
                                    <div
                                    className={`dt-tower ${arming ? "is-arming" : ""} ${settled ? "is-settled" : ""}`}
                                    ref={towerRef}
                                >
                                    {[...Array(ROWS)].map((_, row) => {
                                        const isCurrentRow = started && row === selected.length && !gameOver && !cashOut;
                                        const isClimbed = selected.length > row;
                                        const isPending = pendingRow === row;
                                        const canPick = isCurrentRow && boardReady && pendingRow === null;
                                        return (
                                            <div
                                                className={`dt-row ${isCurrentRow ? "is-active" : ""} ${isClimbed ? "is-climbed" : ""} ${isPending ? "is-pending" : ""}`}
                                                key={row}
                                                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                                            >
                                                {[...Array(cols)].map((_, index) => {
                                                    const isProgressRevealed = selected.length > row;
                                                    // dragons[] is only populated on a hit — safe/cash-out
                                                    // rounds never expose a dragon tile.
                                                    const isDragon = dragons[row] === index;
                                                    const isSelected = selected[row] === index;
                                                    const isRevealed = isProgressRevealed || isDragonRevealed(row);
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
                                                            whileHover={canPick ? { scale: 1.06, y: -3 } : {}}
                                                            whileTap={canPick ? { scale: 0.95 } : {}}
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
                            </div>
                            {placingBet && <p className="staging-note">The dragon stirs…</p>}
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
                                            disabled={placingBet}
                                        />
                                        <div className="game-adjust">
                                            <button type="button" onClick={handleHalf} disabled={placingBet}>½</button>
                                            <button type="button" onClick={handleDouble} disabled={placingBet}>2×</button>
                                        </div>
                                    </div>
                                    <div className="game-field">
                                        <label className="game-label">Difficulty</label>
                                        <select
                                            className="game-select"
                                            value={difficulty}
                                            onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                                            disabled={placingBet}
                                        >
                                            {(Object.keys(difficulties) as DifficultyLevel[]).map((lvl) => (
                                                <option key={lvl} value={lvl}>{difficultyLabels[lvl]}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <PendingButton pending={placingBet} pendingLabel="PLACING BET…" type="submit">
                                        Place Bet
                                    </PendingButton>
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
                                    {resumed && (
                                        <p className="dt-resume-note">
                                            Climb resumed — ₹{amount.toFixed(2)} staked, floor {selected.length} of {ROWS}.
                                        </p>
                                    )}
                                    <div className="game-stat game-stat--mult">
                                        <div className="game-stat__label">Multiplier</div>
                                        <div className={`game-stat__value ${multiplierPop ? "dt-pop" : ""}`}>
                                            {multiplierLabel}×
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
                                                : maxed || selected.length >= ROWS
                                                    ? "Summit reached — bank your winnings."
                                                    : pendingRow !== null
                                                        ? "The dragon stirs…"
                                                        : `Floor ${selected.length} of ${ROWS} — keep climbing.`}
                                    </p>
                                    {!gameOver && (
                                        <button
                                            className="game-cashout"
                                            onClick={handleCashOut}
                                            disabled={cashingOut || selected.length === 0}
                                        >
                                            {cashingOut
                                                ? "Cashing Out…"
                                                : selected.length === 0
                                                    ? "Climb a floor to cash out"
                                                    : `Cash Out ₹${earnings.toFixed(2)}`}
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

            {/* rules modal — same .howto- chrome as the old inline trigger,
                now opened from the standardized GameHeader */}
            {showRules && (
                <div className="howto-overlay" onClick={() => setShowRules(false)}>
                    <div className="howto-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="howto-close" onClick={() => setShowRules(false)} aria-label="Close">
                            <X size={18} />
                        </button>
                        <h3 className="howto-title">How to play Dragon Tower</h3>
                        <ol className="howto-steps">
                            {DRAGON_RULES.map((s, i) => (
                                <li key={i}><span className="howto-num">{i + 1}</span>{s}</li>
                            ))}
                        </ol>
                        <p className="howto-tip"><strong>Tip:</strong> Higher difficulty has fewer safe tiles per floor but pays much more.</p>
                    </div>
                </div>
            )}
        </>
    );
}
