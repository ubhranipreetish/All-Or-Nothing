"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePoker } from "../../components/poker/usePoker";
import PokerTable from "../../components/poker/PokerTable";
import Navbar from "../../components/Navbar";
import HowToPlay from "../../components/HowToPlay";
import { useAuth } from "../../contexts/AuthContext";
import { useWallet } from "../../contexts/WalletContext";
import "../../styles/Poker.css";

type SessionStart = { mode: "create"; buyIn: number } | { mode: "join"; code: string };

/* ------------------------------------------------------------------ shell */
/* The cinematic two-column lobby frame, reused by the menu and the
   pre-admit (entering / waiting) screens so they feel like one place. */
function LobbyShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="pk-page pk-page--lobby">
            <div className="pk-lobby2">
                <div className="pk-lobby2__brand">
                    <div className="pk-eyebrow"><span className="pk-eyebrow__dot" /> PRIVATE TABLES · PLAY-MONEY ₹</div>
                    <h1 className="pk-lobby2__title">POKER</h1>
                    <p className="pk-lobby2__tag">Read them. Bluff them. Take it all.</p>
                    <p className="pk-lobby2__desc">
                        No-limit Texas Hold&apos;em for up to six friends, in real time. Spin up a
                        private room, share the code, and play with credits from your wallet.
                    </p>
                    <ul className="pk-feats">
                        <li><span className="pk-feats__s red">♥</span> Create a private room &amp; share a 4-letter code</li>
                        <li><span className="pk-feats__s">♠</span> The host admits players &amp; starts the game</li>
                        <li><span className="pk-feats__s red">♦</span> Up to 6 seats · live betting &amp; showdowns</li>
                    </ul>
                    <div style={{ marginTop: "1.4rem" }}><HowToPlay game="poker" /></div>
                </div>
                <div className="pk-lobby2__panel">{children}</div>
            </div>
        </div>
    );
}

/* --------------------------------------------------------------- live room */
/* Owns the socket for the whole session so the entering → waiting → table
   transition never reconnects. Charges the wallet only on admit/create. */
function PokerSession({
    start,
    name,
    playerId,
    token,
    onExit,
}: {
    start: SessionStart;
    name: string;
    playerId: string;
    token: string;
    onExit: () => void;
}) {
    const { wallet, recordBet, recordWin, refundBet, refreshWallet } = useWallet();
    const poker = usePoker(name, { playerId, token });
    const { state, connected, error, joinStatus, admittedBuyIn } = poker;

    type Phase = "connecting" | "notfound" | "entering" | "waiting" | "denied" | "room";
    const [phase, setPhase] = useState<Phase>("connecting");
    const [hostName, setHostName] = useState("the host");
    const [buyIn, setBuyIn] = useState(start.mode === "create" ? start.buyIn : Math.min(1000, Math.floor(wallet) || 1000));
    const [err, setErr] = useState("");
    const code = start.mode === "join" ? start.code : "";

    const initedRef = useRef(false);
    const chargedRef = useRef(false);
    const stakeRef = useRef(start.mode === "create" ? start.buyIn : 0);

    const exitRoom = useCallback(() => {
        const started = state?.started ?? false;
        const myStack = state?.seats.find((s) => s?.isYou)?.stack ?? 0;
        if (started) {
            // Real game-end settlement: cash the remaining stack out as a win.
            if (myStack > 0) recordWin(myStack, stakeRef.current || myStack, "POKER");
        } else if (chargedRef.current) {
            // Waiting room — the buy-in never hit the felt, so hand it straight
            // back and stamp the ledger REFUND instead of WIN.
            refundBet("POKER");
        }
        poker.leave();
        refreshWallet();
        onExit();
    }, [state, recordWin, refundBet, poker, refreshWallet, onExit]);

    // On connect: create the room (host) or peek the room (joiner).
    useEffect(() => {
        if (!connected || initedRef.current) return;
        initedRef.current = true;
        if (start.mode === "create") {
            const amt = start.buyIn;
            (async () => {
                // Hold the buy-in first — the "₹X held by the house" copy below
                // is only honest if the house is actually holding it.
                const ok = await recordBet(amt, "POKER");
                if (!ok) { setErr("Couldn't hold your buy-in — nothing was charged. Try again."); return; }
                chargedRef.current = true;
                stakeRef.current = amt;
                poker.createRoom(amt, async (c) => {
                    if (!c) {
                        // Room creation failed after the stake was taken — hand it
                        // back (ledger stamps REFUND) and say so.
                        await refundBet("POKER");
                        chargedRef.current = false;
                        await refreshWallet();
                        setErr(`Couldn't create the room — your ₹${amt} buy-in has been returned.`);
                        return;
                    }
                    await refreshWallet();
                    setPhase("room");
                });
            })();
        } else {
            poker.peek(code, (r) => {
                if (!r.exists) { setPhase("notfound"); return; }
                setHostName(r.hostName || "the host");
                setPhase("entering");
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    // React to the host's decision once we're waiting.
    useEffect(() => {
        if (joinStatus === "admitted" && !chargedRef.current) {
            chargedRef.current = true;
            const amt = admittedBuyIn ?? buyIn;
            (async () => {
                const ok = await recordBet(amt, "POKER");
                if (!ok) {
                    // Nothing was charged — step back out and let them retry.
                    poker.leave();
                    poker.resetJoin();
                    chargedRef.current = false;
                    setErr("Couldn't hold your buy-in — nothing was charged. Try again.");
                    setPhase("entering");
                    return;
                }
                stakeRef.current = amt;
                await refreshWallet();
                setPhase("room");
            })();
        }
        if (joinStatus === "denied") setPhase("denied");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [joinStatus, admittedBuyIn]);

    const submitJoin = () => {
        setErr("");
        if (buyIn < 100) return setErr("Minimum buy-in is ₹100");
        if (buyIn > wallet) return setErr("Buy-in exceeds your balance");
        poker.requestJoin(code, buyIn, (r) => {
            if (!r.ok) { setErr("Couldn't reach the host — try again"); return; }
            setHostName(r.hostName || hostName);
            setPhase("waiting");
        });
    };

    /* ----- pre-admit screens (inside the lobby shell) ----- */
    if (phase === "connecting" || phase === "notfound" || phase === "entering" || phase === "waiting" || phase === "denied") {
        return (
            <>
                <Navbar />
                <LobbyShell>
                    {phase === "connecting" && (
                        <div className="pk-panel-card pk-wait">
                            {!err ? (
                                <>
                                    <div className="pk-spinner" />
                                    <p className="pk-wait__txt">
                                        {start.mode === "create" ? (
                                            <>Reserving your seat — ₹{start.buyIn} held by the house<span className="pk-dots"><i>.</i><i>.</i><i>.</i></span></>
                                        ) : (
                                            "Connecting…"
                                        )}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="pk-lobby__err">{err}</div>
                                    <button className="pk-mini pk-mini--wide" onClick={onExit}>Back to lobby</button>
                                </>
                            )}
                        </div>
                    )}

                    {phase === "notfound" && (
                        <div className="pk-panel-card">
                            <h2 className="pk-panel-card__h">Room not found</h2>
                            <p className="pk-panel-card__p">No active room with code <strong>{code}</strong>. Double-check it with the host.</p>
                            <button className="pk-cta" onClick={onExit}>Back to lobby</button>
                        </div>
                    )}

                    {phase === "entering" && (
                        <div className="pk-panel-card pk-entering">
                            <span className="pk-entering__eyebrow">JOINING ROOM {code}</span>
                            <h2 className="pk-panel-card__h">Entering {hostName}&apos;s room</h2>
                            <label className="pk-field">
                                <span>Your buy-in · balance ₹{wallet.toFixed(2)}</span>
                                <input
                                    type="number"
                                    min={100}
                                    max={Math.floor(wallet)}
                                    value={buyIn}
                                    onChange={(e) => setBuyIn(Math.floor(Number(e.target.value) || 0))}
                                />
                            </label>
                            <div className="pk-buyin-quick">
                                {[500, 1000, 2500, 5000].map((v) => (
                                    <button key={v} className={`pk-chipbtn-amt ${buyIn === v ? "on" : ""}`} onClick={() => setBuyIn(v)} disabled={v > wallet}>₹{v}</button>
                                ))}
                            </div>
                            {err && <div className="pk-lobby__err">{err}</div>}
                            <button className="pk-cta" onClick={submitJoin}>Enter</button>
                            <button className="pk-mini pk-mini--wide" onClick={onExit}>Back</button>
                            <p className="pk-lobby__hint">Your buy-in is taken only once {hostName} lets you in.</p>
                        </div>
                    )}

                    {phase === "waiting" && (
                        <div className="pk-panel-card pk-wait">
                            <div className="pk-spinner" />
                            <h2 className="pk-panel-card__h">Waiting for {hostName} to allow you<span className="pk-dots"><i>.</i><i>.</i><i>.</i></span></h2>
                            <p className="pk-panel-card__p">You&apos;ll join the table as soon as the host admits you. Nothing has been deducted yet.</p>
                            <button className="pk-mini pk-mini--wide" onClick={() => { poker.cancelWait(); onExit(); }}>Cancel</button>
                        </div>
                    )}

                    {phase === "denied" && (
                        <div className="pk-panel-card">
                            <h2 className="pk-panel-card__h">Host declined</h2>
                            <p className="pk-panel-card__p">{hostName} didn&apos;t let you into the room this time.</p>
                            <button className="pk-cta" onClick={onExit}>Back to lobby</button>
                        </div>
                    )}
                </LobbyShell>
            </>
        );
    }

    /* ----- live table / host lobby ----- */
    return (
        <div className="pk-page">
            {error && <div className="pk-toast">{error}</div>}
            {!state ? (
                <div className="pk-loading">
                    Taking a seat…
                    <button className="pk-mini" style={{ marginLeft: 12 }} onClick={exitRoom}>Back to lobby</button>
                </div>
            ) : (
                <PokerTable
                    state={state}
                    onAct={poker.act}
                    onLeave={exitRoom}
                    onSitOut={poker.sitOut}
                    onSitIn={poker.sitIn}
                    onRebuy={poker.rebuy}
                    onAdmit={poker.admit}
                    onDeny={poker.deny}
                    onStart={poker.startGame}
                />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------- page */
function PokerPageInner() {
    const { user } = useAuth();
    const { wallet } = useWallet();
    const params = useSearchParams();
    const [buyIn, setBuyIn] = useState(1000);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [session, setSession] = useState<SessionStart | null>(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

    // Shared link: /poker?room=CODE → jump straight into the join flow.
    useEffect(() => {
        const room = params.get("room");
        if (room) setCode(room.toUpperCase().slice(0, 4));
    }, [params]);
    const autoRoom = params.get("room");
    useEffect(() => {
        if (autoRoom && user && !session) setSession({ mode: "join", code: autoRoom.toUpperCase().slice(0, 4) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRoom, user]);

    const startCreate = () => {
        setError("");
        if (!user || session) return;
        if (buyIn < 100) return setError("Minimum buy-in is ₹100");
        if (buyIn > wallet) return setError("Buy-in exceeds your balance");
        setSession({ mode: "create", buyIn });
    };
    const startJoin = () => {
        setError("");
        if (!user) return;
        if (code.trim().length < 4) return setError("Enter a valid room code");
        setSession({ mode: "join", code: code.trim().toUpperCase() });
    };

    if (session && user) {
        return (
            <PokerSession
                start={session}
                name={user.name}
                playerId={user.id}
                token={token}
                onExit={() => setSession(null)}
            />
        );
    }

    return (
        <>
            <Navbar />
            <LobbyShell>
                {!user ? (
                    <div className="pk-panel-card">
                        <h2 className="pk-panel-card__h">Sign in to play</h2>
                        <p className="pk-panel-card__p">
                            Use <strong>Sign in with Google</strong> at the top-right to create or
                            join a room with your credits.
                        </p>
                        <p className="pk-lobby__hint">Just practicing? Try the free table at <a href="/poker-test">/poker-test</a>.</p>
                    </div>
                ) : (
                    <div className="pk-panel-card">
                        <label className="pk-field">
                            <span>Buy-in · balance ₹{wallet.toFixed(2)}</span>
                            <input
                                type="number"
                                min={100}
                                max={Math.floor(wallet)}
                                value={buyIn}
                                onChange={(e) => setBuyIn(Math.floor(Number(e.target.value) || 0))}
                            />
                        </label>
                        <div className="pk-buyin-quick">
                            {[500, 1000, 2500, 5000].map((v) => (
                                <button key={v} className={`pk-chipbtn-amt ${buyIn === v ? "on" : ""}`} onClick={() => setBuyIn(v)} disabled={v > wallet}>₹{v}</button>
                            ))}
                        </div>

                        {error && <div className="pk-lobby__err">{error}</div>}

                        <button className="pk-cta" onClick={startCreate} disabled={!!session}>Create Room</button>

                        <div className="pk-or">or join a room</div>
                        <div className="pk-join">
                            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="ROOM CODE" maxLength={4} />
                            <button disabled={code.trim().length < 4} onClick={startJoin}>Join</button>
                        </div>

                        <p className="pk-lobby__hint">Creating a room makes you the host — you admit players and start the game.</p>
                    </div>
                )}
            </LobbyShell>
        </>
    );
}

export default function PokerPage() {
    return (
        <Suspense fallback={<div className="pk-page"><div className="pk-loading">Loading…</div></div>}>
            <PokerPageInner />
        </Suspense>
    );
}
