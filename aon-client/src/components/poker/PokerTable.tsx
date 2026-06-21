"use client";

import { useEffect, useState } from "react";
import { TableState, Card } from "./usePoker";

const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
const RANK: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankLabel = (r: number) => RANK[r] || String(r);

function PlayingCard({ card, back }: { card?: Card | null; back?: boolean }) {
    if (back || !card) return <div className="pk-card pk-card--back" />;
    const red = card.s === "h" || card.s === "d";
    return (
        <div className={`pk-card ${red ? "pk-card--red" : ""}`}>
            <span className="pk-card__r">{rankLabel(card.r)}</span>
            <span className="pk-card__s">{SUIT[card.s]}</span>
        </div>
    );
}

/* 6 fixed positions around the felt; index 0 is the bottom (the viewer). */
const POS = ["pp-0", "pp-1", "pp-2", "pp-3", "pp-4", "pp-5"];

export default function PokerTable({
    state,
    onAct,
    onLeave,
}: {
    state: TableState;
    onAct: (type: string, amount?: number) => void;
    onLeave: () => void;
}) {
    const mySeat = state.seats.find((s) => s?.isYou)?.seat ?? 0;
    const phaseLabel =
        state.phase === "waiting" ? "Waiting for players…" : state.phase.toUpperCase();

    return (
        <div className="pk">
            <div className="pk-top">
                <div className="pk-top__meta">
                    <span className="pk-code">TABLE {state.tableId}</span>
                    <span className="pk-blinds">
                        Blinds {state.smallBlind}/{state.bigBlind}
                    </span>
                </div>
                <button className="pk-leave" onClick={onLeave}>
                    Leave
                </button>
            </div>

            <div className="pk-felt">
                <div className="pk-center">
                    <div className="pk-phase">{phaseLabel}</div>
                    <div className="pk-community">
                        {state.community.map((c, i) => (
                            <PlayingCard key={i} card={c} />
                        ))}
                        {Array.from({ length: 5 - state.community.length }).map((_, i) => (
                            <div key={`e${i}`} className="pk-card pk-card--empty" />
                        ))}
                    </div>
                    <div className="pk-pot">Pot ₵{state.pot}</div>
                    {state.winners && state.winners.length > 0 && (
                        <div className="pk-winner">
                            {state.winners
                                .map((w) => `${state.seats[w.seat]?.name ?? "?"} wins ₵${w.amount} (${w.handName})`)
                                .join(" · ")}
                        </div>
                    )}
                </div>

                {state.seats.map((s, seat) => {
                    const disp = (seat - mySeat + 6) % 6;
                    if (!s)
                        return (
                            <div key={seat} className={`pk-seat pk-seat--empty ${POS[disp]}`}>
                                <span>Empty</span>
                            </div>
                        );
                    return (
                        <div
                            key={seat}
                            className={`pk-seat ${POS[disp]} ${s.isTurn ? "pk-seat--turn" : ""} ${
                                s.folded ? "pk-seat--folded" : ""
                            } ${s.isYou ? "pk-seat--you" : ""}`}
                        >
                            {state.dealer === seat && <span className="pk-dealer">D</span>}
                            <div className="pk-seat__cards">
                                {s.cards ? (
                                    s.cards.map((c, i) => <PlayingCard key={i} card={c} />)
                                ) : s.hasCards ? (
                                    <>
                                        <PlayingCard back />
                                        <PlayingCard back />
                                    </>
                                ) : null}
                            </div>
                            <div className="pk-seat__plate">
                                <span className="pk-seat__name">
                                    {s.name}
                                    {s.isYou ? " (you)" : ""}
                                </span>
                                <span className="pk-seat__stack">₵{s.stack}</span>
                            </div>
                            {s.bet > 0 && <div className="pk-seat__bet">₵{s.bet}</div>}
                            {s.lastAction && <div className="pk-seat__action">{s.allIn ? "All-in" : s.lastAction}</div>}
                        </div>
                    );
                })}
            </div>

            <ActionBar state={state} onAct={onAct} />
        </div>
    );
}

function ActionBar({ state, onAct }: { state: TableState; onAct: (t: string, a?: number) => void }) {
    const legal = state.legal;
    const [raiseTo, setRaiseTo] = useState(0);

    useEffect(() => {
        if (legal) setRaiseTo(legal.minRaiseTo);
    }, [legal, state.handId, state.toAct]);

    if (!legal) {
        return (
            <div className="pk-actions pk-actions--idle">
                {state.handActive ? "Waiting for other players…" : "Next hand starting soon…"}
            </div>
        );
    }

    return (
        <div className="pk-actions">
            <button className="pk-btn pk-btn--fold" onClick={() => onAct("fold")}>
                Fold
            </button>
            {legal.canCheck ? (
                <button className="pk-btn" onClick={() => onAct("check")}>
                    Check
                </button>
            ) : (
                <button className="pk-btn pk-btn--call" onClick={() => onAct("call")}>
                    Call ₵{legal.callAmount}
                </button>
            )}
            {legal.canRaise && (
                <div className="pk-raise">
                    <input
                        type="range"
                        min={legal.minRaiseTo}
                        max={legal.maxRaiseTo}
                        value={Math.min(Math.max(raiseTo, legal.minRaiseTo), legal.maxRaiseTo)}
                        onChange={(e) => setRaiseTo(Number(e.target.value))}
                    />
                    <button
                        className="pk-btn pk-btn--raise"
                        onClick={() => onAct(legal.isBet ? "bet" : "raise", raiseTo)}
                    >
                        {legal.isBet ? "Bet" : "Raise to"} ₵{raiseTo}
                        {raiseTo >= legal.maxRaiseTo ? " (All-in)" : ""}
                    </button>
                </div>
            )}
        </div>
    );
}
