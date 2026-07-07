"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

type GameKey = "mines" | "dragon" | "wheel" | "roulette" | "poker";

interface Rules {
    title: string;
    steps: string[];
    tip?: string;
}

const RULES: Record<GameKey, Rules> = {
    mines: {
        title: "How to play Mines",
        steps: [
            "Set your bet and how many mines hide on the 5×5 board, then Place Bet.",
            "Flip tiles to find gems — every gem raises your multiplier.",
            "Cash out any time to bank bet × multiplier.",
            "Hit a mine and you lose the bet — so quit while you're ahead.",
        ],
        tip: "More mines = bigger multiplier per gem, but a higher chance of busting.",
    },
    dragon: {
        title: "How to play Dragon Tower",
        steps: [
            "Set your bet and difficulty, then Place Bet.",
            "On each floor, pick one stone — a safe stone lets you climb and grows your multiplier.",
            "Cash out any time to bank your winnings.",
            "Pick the dragon's tile and the climb ends — you lose the bet.",
        ],
        tip: "Higher difficulty has fewer safe tiles per floor but pays much more.",
    },
    wheel: {
        title: "How to play Fortune Wheel",
        steps: [
            "Set your bet, risk level and number of segments.",
            "Spin the wheel and watch where the pointer lands.",
            "Your payout is bet × the multiplier you land on.",
            "Landing on 0.00× means you lose the bet.",
        ],
        tip: "Higher risk has bigger top multipliers but more losing segments.",
    },
    roulette: {
        title: "How to play Roulette",
        steps: [
            "Tap a chip value, then tap the felt to place it (right-click a spot to remove).",
            "Bet on single numbers, splits, dozens, columns, colours, odd/even, or 1–18 / 19–36.",
            "Press Spin — if the ball lands on a number your bet covers, you win.",
            "Payouts scale with risk: a single number pays 35:1, red/black pays 1:1.",
        ],
        tip: "European single-zero wheel — one green 0 is the only house edge.",
    },
    poker: {
        title: "How to play Poker",
        steps: [
            "No-Limit Texas Hold'em for up to 6 friends.",
            "Create a room and share the code — you're the host.",
            "Admit players from the waiting room, then Start the game.",
            "Make the best 5-card hand (or get everyone to fold) to win the pot.",
        ],
        tip: "Late joiners spectate the current hand, then are dealt in next hand.",
    },
};

/** A small "How to play" button + modal. Drop into any game header. */
export default function HowToPlay({ game, className = "" }: { game: GameKey; className?: string }) {
    const [open, setOpen] = useState(false);
    const r = RULES[game];

    return (
        <>
            <button className={`howto-btn ${className}`} onClick={() => setOpen(true)} aria-label="How to play">
                <HelpCircle size={15} />
                <span>How to play</span>
            </button>

            {open && (
                <div className="howto-overlay" onClick={() => setOpen(false)}>
                    <div className="howto-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="howto-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
                        <h3 className="howto-title">{r.title}</h3>
                        <ol className="howto-steps">
                            {r.steps.map((s, i) => (
                                <li key={i}><span className="howto-num">{i + 1}</span>{s}</li>
                            ))}
                        </ol>
                        {r.tip && <p className="howto-tip"><strong>Tip:</strong> {r.tip}</p>}
                    </div>
                </div>
            )}
        </>
    );
}
