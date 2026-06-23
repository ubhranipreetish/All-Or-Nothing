"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TableState, Card, SeatView } from "./types";
import { sounds, isSoundEnabled, setSoundEnabled } from "./sounds";

const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" } as const;
const RANK: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankLabel = (r: number) => RANK[r] || String(r);

function PlayingCard({ card, back, small }: { card?: Card | null; back?: boolean; small?: boolean }) {
    const cls = `pk-card ${small ? "pk-card--sm" : ""}`;
    if (back || !card) return <div className={`${cls} pk-card--back`} />;
    const red = card.s === "h" || card.s === "d";
    return (
        <div className={`${cls} ${red ? "pk-card--red" : ""}`}>
            <span className="pk-card__r">{rankLabel(card.r)}</span>
            <span className="pk-card__s">{SUIT[card.s]}</span>
        </div>
    );
}

const POS = ["pp-0", "pp-1", "pp-2", "pp-3", "pp-4", "pp-5"];

/* clock sync: estimate the server/client offset once per snapshot */
function useTurnClock(state: TableState) {
    const offset = useRef(0);
    const [, force] = useState(0);
    useEffect(() => {
        offset.current = state.serverNow - Date.now();
    }, [state.serverNow]);
    useEffect(() => {
        if (!state.deadlineTs) return;
        const id = setInterval(() => force((n) => n + 1), 200);
        return () => clearInterval(id);
    }, [state.deadlineTs]);
    if (!state.deadlineTs) return { secondsLeft: 0, frac: 0 };
    const remaining = state.deadlineTs - (Date.now() + offset.current);
    const secondsLeft = Math.max(0, remaining / 1000);
    const frac = Math.max(0, Math.min(1, secondsLeft / (state.turnSeconds || 20)));
    return { secondsLeft, frac };
}

export default function PokerTable({
    state,
    onAct,
    onLeave,
    onSitOut,
    onSitIn,
    onRebuy,
}: {
    state: TableState;
    onAct: (type: string, amount?: number) => void;
    onLeave: () => void;
    onSitOut?: () => void;
    onSitIn?: () => void;
    onRebuy?: () => void;
}) {
    const mySeat = state.seats.find((s) => s?.isYou) ?? null;
    const clock = useTurnClock(state);
    const [muted, setMuted] = useState(!isSoundEnabled());

    // sound cues on key transitions
    const prevHand = useRef(state.handId);
    const wasMyTurn = useRef(false);
    useEffect(() => {
        if (state.handId !== prevHand.current) {
            prevHand.current = state.handId;
            sounds.deal();
        }
    }, [state.handId]);
    useEffect(() => {
        const myTurn = !!state.legal;
        if (myTurn && !wasMyTurn.current) sounds.turn();
        wasMyTurn.current = myTurn;
    }, [state.legal]);
    useEffect(() => {
        if (state.phase === "showdown" && state.winners?.some((w) => state.seats[w.seat]?.isYou)) sounds.win();
    }, [state.phase, state.winners, state.seats]);

    const phaseLabel = state.phase === "waiting" ? "Waiting for players…" : state.phase.toUpperCase();

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        setSoundEnabled(!next);
    };

    return (
        <div className="pk">
            <div className="pk-top">
                <div className="pk-top__meta">
                    <span className="pk-code">TABLE {state.tableId}</span>
                    <span className="pk-blinds">
                        Blinds {state.smallBlind}/{state.bigBlind} · Hand #{state.handId}
                    </span>
                </div>
                <div className="pk-top__right">
                    <button className="pk-icon" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
                        {muted ? "🔇" : "🔊"}
                    </button>
                    {state.youSeated && !state.youAway && onSitOut && (
                        <button className="pk-mini" onClick={onSitOut}>
                            Sit out
                        </button>
                    )}
                    {state.youSeated && state.youAway && onSitIn && (
                        <button className="pk-mini pk-mini--on" onClick={onSitIn}>
                            I&apos;m back
                        </button>
                    )}
                    {state.youCanRebuy && onRebuy && (
                        <button className="pk-mini pk-mini--gold" onClick={onRebuy}>
                            Rebuy
                        </button>
                    )}
                    <button className="pk-leave" onClick={onLeave}>
                        Leave
                    </button>
                </div>
            </div>

            <div className="pk-felt">
                <div className="pk-center">
                    <div className="pk-phase">{phaseLabel}</div>
                    <div className="pk-community">
                        <AnimatePresence>
                            {state.community.map((c, i) => (
                                <motion.div
                                    key={`${state.handId}-${i}`}
                                    initial={{ opacity: 0, y: -16, rotateY: 90 }}
                                    animate={{ opacity: 1, y: 0, rotateY: 0 }}
                                    transition={{ delay: i * 0.08, duration: 0.35 }}
                                >
                                    <PlayingCard card={c} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {Array.from({ length: 5 - state.community.length }).map((_, i) => (
                            <div key={`e${i}`} className="pk-card pk-card--empty" />
                        ))}
                    </div>
                    <div className="pk-pot">Pot ₵{state.pot}</div>
                    {state.winners && state.winners.length > 0 && (
                        <motion.div
                            className="pk-winner"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            {state.winners
                                .map((w) => `${state.seats[w.seat]?.name ?? "?"} wins ₵${w.amount} · ${w.handName}`)
                                .join("   •   ")}
                        </motion.div>
                    )}
                </div>

                {state.seats.map((s, seat) => {
                    const disp = (seat - (mySeat?.seat ?? 0) + 6) % 6;
                    return (
                        <Seat
                            key={seat}
                            seat={s}
                            posClass={POS[disp]}
                            frac={s?.isTurn ? clock.frac : 0}
                            secondsLeft={s?.isTurn ? clock.secondsLeft : 0}
                        />
                    );
                })}
            </div>

            <ActionArea state={state} mySeat={mySeat} onAct={onAct} />
        </div>
    );
}

function Seat({
    seat,
    posClass,
    frac,
    secondsLeft,
}: {
    seat: SeatView | null;
    posClass: string;
    frac: number;
    secondsLeft: number;
}) {
    if (!seat)
        return (
            <div className={`pk-seat pk-seat--empty ${posClass}`}>
                <span>Open</span>
            </div>
        );

    const ringStyle = seat.isTurn
        ? { background: `conic-gradient(var(--gold-bright,#ffd877) ${frac * 360}deg, rgba(255,255,255,0.12) 0deg)` }
        : undefined;

    return (
        <div
            className={`pk-seat ${posClass} ${seat.isTurn ? "pk-seat--turn" : ""} ${seat.folded ? "pk-seat--folded" : ""} ${
                seat.isYou ? "pk-seat--you" : ""
            } ${seat.away ? "pk-seat--away" : ""} ${seat.isWinner ? "pk-seat--winner" : ""}`}
        >
            <div className="pk-seat__cards">
                {seat.cards ? (
                    seat.cards.map((c, i) => <PlayingCard key={i} card={c} small />)
                ) : seat.hasCards ? (
                    <>
                        <PlayingCard back small />
                        <PlayingCard back small />
                    </>
                ) : null}
            </div>

            <div className="pk-avatar" style={ringStyle}>
                <div className="pk-avatar__inner">
                    {seat.isTurn ? Math.ceil(secondsLeft) : seat.name.slice(0, 1).toUpperCase()}
                </div>
                {seat.isDealer && <span className="pk-badge pk-badge--d">D</span>}
                {seat.blind && <span className={`pk-badge pk-badge--${seat.blind.toLowerCase()}`}>{seat.blind}</span>}
            </div>

            <div className="pk-seat__plate">
                <span className="pk-seat__name">
                    {seat.name}
                    {seat.isYou ? " (you)" : ""}
                    {seat.disconnected ? " ⚠" : ""}
                </span>
                <span className="pk-seat__stack">{seat.away ? "Sitting out" : `₵${seat.stack}`}</span>
            </div>

            {seat.bet > 0 && <div className="pk-seat__bet">₵{seat.bet}</div>}
            {seat.lastAction && !seat.away && (
                <div className={`pk-seat__action ${seat.allIn ? "pk-seat__action--allin" : ""}`}>
                    {seat.allIn ? "All-in" : seat.lastAction}
                </div>
            )}
        </div>
    );
}

function ActionArea({
    state,
    mySeat,
    onAct,
}: {
    state: TableState;
    mySeat: SeatView | null;
    onAct: (t: string, a?: number) => void;
}) {
    const legal = state.legal;
    const inHand = !!mySeat && mySeat.hasCards && !mySeat.folded;

    /* pre-actions: arm a move while it's not your turn; auto-fire on your turn */
    const [armed, setArmed] = useState<null | "fold" | "checkcall">(null);
    useEffect(() => {
        if (legal && armed) {
            if (armed === "fold") legal.canCheck ? onAct("check") : onAct("fold");
            else legal.canCheck ? onAct("check") : onAct("call");
            setArmed(null);
        }
    }, [legal, armed, onAct]);
    useEffect(() => {
        setArmed(null);
    }, [state.handId]);

    const [raiseTo, setRaiseTo] = useState(0);
    useEffect(() => {
        if (legal) setRaiseTo(legal.minRaiseTo);
    }, [legal, state.handId, state.toAct]);

    if (!legal) {
        if (state.youAway)
            return <div className="pk-actions pk-actions--idle">You&apos;re sitting out — “I&apos;m back” to rejoin.</div>;
        if (inHand && state.handActive)
            return (
                <div className="pk-preactions">
                    <span className="pk-pre__label">Pre-action:</span>
                    <button className={`pk-pre ${armed === "fold" ? "pk-pre--on" : ""}`} onClick={() => setArmed(armed === "fold" ? null : "fold")}>
                        Check/Fold
                    </button>
                    <button
                        className={`pk-pre ${armed === "checkcall" ? "pk-pre--on" : ""}`}
                        onClick={() => setArmed(armed === "checkcall" ? null : "checkcall")}
                    >
                        Check/Call
                    </button>
                </div>
            );
        return (
            <div className="pk-actions pk-actions--idle">
                {state.handActive ? "Waiting for other players…" : "Next hand starting soon…"}
            </div>
        );
    }

    // bet-size presets (online-poker style), clamped to legal bounds
    const clamp = (v: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
    const potAfterCall = state.pot + legal.toCall;
    const presets: { label: string; to: number }[] = [
        { label: "Min", to: legal.minRaiseTo },
        { label: "½ Pot", to: clamp(state.currentBet + potAfterCall * 0.5) },
        { label: "¾ Pot", to: clamp(state.currentBet + potAfterCall * 0.75) },
        { label: "Pot", to: clamp(state.currentBet + potAfterCall) },
        { label: "All-in", to: legal.maxRaiseTo },
    ];
    const uniquePresets = presets.filter((p, i, arr) => arr.findIndex((x) => x.to === p.to) === i);
    const raiseValue = clamp(raiseTo);

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
                    <div className="pk-raise__presets">
                        {uniquePresets.map((p) => (
                            <button
                                key={p.label}
                                className={`pk-chip ${raiseValue === p.to ? "pk-chip--on" : ""}`}
                                onClick={() => setRaiseTo(p.to)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="pk-raise__row">
                        <input
                            type="range"
                            min={legal.minRaiseTo}
                            max={legal.maxRaiseTo}
                            value={raiseValue}
                            onChange={(e) => setRaiseTo(Number(e.target.value))}
                        />
                        <input
                            className="pk-raise__num"
                            type="number"
                            min={legal.minRaiseTo}
                            max={legal.maxRaiseTo}
                            value={raiseValue}
                            onChange={(e) => setRaiseTo(Number(e.target.value))}
                        />
                        <button
                            className="pk-btn pk-btn--raise"
                            onClick={() => onAct(legal.isBet ? "bet" : "raise", raiseValue)}
                        >
                            {legal.isBet ? "Bet" : "Raise to"} ₵{raiseValue}
                            {raiseValue >= legal.maxRaiseTo ? " (All-in)" : ""}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
