"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { usePoker } from "../../components/poker/usePoker";
import PokerTable from "../../components/poker/PokerTable";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import GameHeader from "../../components/game/GameHeader";
import { useLeaveGuard } from "../../components/game/LeaveGuard";
import { useAuth } from "../../contexts/AuthContext";
import { useWallet } from "../../contexts/WalletContext";
import "../../styles/Poker.css";

type SessionStart = { mode: "create"; buyIn: number } | { mode: "join"; code: string };

/* --------------------------------------------------------- money plumbing */
/* Poker money moves ONLY over these two authenticated HTTP endpoints — never
   over the socket. buyin debits the user's OWN balance and returns a secret
   seatToken; settle credits the SERVER's authoritative final stack (recorded by
   the socket layer when the seat was vacated), never a client-named amount.
   WalletContext can't be edited, so these live here as direct fetches. */
const POKER_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
const authToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") : null);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type BuyInResult = { sessionId: string; seatToken: string; newBalance: number };
type SettleResult = { ready: boolean; credited: number; newBalance: number };

/** Debit the buy-in and open a POKER session. Returns null on any failure (nothing charged). */
async function pokerBuyIn(amount: number): Promise<BuyInResult | null> {
    const token = authToken();
    if (!token) return null;
    try {
        const res = await fetch(`${POKER_API}/game/poker/buyin`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ amount }),
        });
        const data = await res.json();
        if (!res.ok) { console.error("poker buyin error:", data?.message); return null; }
        return data as BuyInResult;
    } catch (e) { console.error("poker buyin failed:", e); return null; }
}

/** Credit the SERVER's authoritative final stack. ready:false → not finalized yet, retry. */
async function pokerSettle(sessionId: string): Promise<SettleResult | null> {
    const token = authToken();
    if (!token) return null;
    try {
        const res = await fetch(`${POKER_API}/game/poker/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (!res.ok) { console.error("poker settle error:", data?.message); return null; }
        return data as SettleResult;
    } catch (e) { console.error("poker settle failed:", e); return null; }
}

/* ---------------------------------------------------------------- rules */
/* Poker's how-to content, shown from GameHeader's "? How to play" button.
   Reuses the shared howto- modal chrome (globals.css). */
const POKER_RULES = {
    title: "How to play Poker",
    steps: [
        "No-Limit Texas Hold'em for up to 6 friends.",
        "Create a room and share the code — you're the host.",
        "Admit players from the waiting room, then Start the game.",
        "Make the best 5-card hand (or get everyone to fold) to win the pot.",
    ],
    tip: "Late joiners spectate the current hand, then are dealt in next hand.",
};

function PokerRulesModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="howto-overlay" onClick={onClose}>
            <div className="howto-modal" onClick={(e) => e.stopPropagation()}>
                <button className="howto-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
                <h3 className="howto-title">{POKER_RULES.title}</h3>
                <ol className="howto-steps">
                    {POKER_RULES.steps.map((s, i) => (
                        <li key={i}><span className="howto-num">{i + 1}</span>{s}</li>
                    ))}
                </ol>
                <p className="howto-tip"><strong>Tip:</strong> {POKER_RULES.tip}</p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ shell */
/* The cinematic two-column lobby frame, reused by the menu and the
   pre-admit (entering / waiting) screens so they feel like one place. */
function LobbyShell({ children }: { children: React.ReactNode }) {
    const [showRules, setShowRules] = useState(false);
    return (
        <div className="pk-page pk-page--lobby">
            <div className="pk-lobby2">
                <div className="pk-lobby2__brand">
                    <GameHeader
                        eyebrow="NO-LIMIT HOLD'EM · 6 SEATS"
                        title="POKER"
                        tagline="Read them. Bluff them. Take it all."
                        onHowToPlay={() => setShowRules(true)}
                    />
                    <p className="pk-lobby2__desc">
                        No-limit Texas Hold&apos;em for up to six friends, in real time. Spin up a
                        private room, share the code, and play with credits from your wallet.
                    </p>
                    <ul className="pk-feats">
                        <li><span className="pk-feats__s red">♥</span> Create a private room &amp; share a 4-letter code</li>
                        <li><span className="pk-feats__s">♠</span> The host admits players &amp; starts the game</li>
                        <li><span className="pk-feats__s red">♦</span> Up to 6 seats · live betting &amp; showdowns</li>
                    </ul>
                </div>
                <div className="pk-lobby2__panel">{children}</div>
            </div>
            {showRules && <PokerRulesModal onClose={() => setShowRules(false)} />}
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
    const { wallet, refundBet, refreshWallet } = useWallet();
    const poker = usePoker(name, { playerId, token });
    const { state, connected, error, joinStatus } = poker;

    type Phase = "connecting" | "notfound" | "entering" | "waiting" | "denied" | "room";
    const [phase, setPhase] = useState<Phase>("connecting");
    const [hostName, setHostName] = useState("the host");
    const [buyIn, setBuyIn] = useState(start.mode === "create" ? start.buyIn : Math.min(1000, Math.floor(wallet) || 1000));
    const [err, setErr] = useState("");
    // Set once the real cash-out completes, so we can show the settled amount
    // before the player returns to the lobby.
    const [cashedOut, setCashedOut] = useState<number | null>(null);
    const code = start.mode === "join" ? start.code : "";

    const initedRef = useRef(false);
    const chargedRef = useRef(false);
    const stakeRef = useRef(start.mode === "create" ? start.buyIn : 0);
    // The server-issued session id + secret seatToken for THIS buy-in — needed to
    // settle (cash-out) or refund exactly this session's money.
    const sessionIdRef = useRef<string | null>(null);
    const seatTokenRef = useRef<string | null>(null);
    // Render-safe mirror of chargedRef/stakeRef for the leave-guard copy:
    // the ₹ currently held by the house, or null while nothing is charged.
    const [heldStake, setHeldStake] = useState<number | null>(null);

    const started = state?.started ?? false;
    const myStack = state?.seats.find((s) => s?.isYou)?.stack ?? 0;

    /* Tells the table we're gone, then settles the money. Shared by the in-UI
       LEAVE button and the leave-guard dialog — one routine, one truth. Returns
       whether this was a real cash-out (post-start) and the amount involved.

       CRITICAL: the socket NEVER moves money. We emit table:leave so the SERVER
       finalizes our authoritative stack, then read that stack back over the
       authenticated settle endpoint. The credited amount is the server's value —
       we never send a number. If the game never started, the buy-in is refunded
       (its own betAmount, server-authoritative) instead. */
    const settleRoom = useCallback(async (): Promise<{ settled: boolean; amount: number }> => {
        // Emit the leave FIRST so the table finalizes our seat's stack before we
        // ask the server to credit it.
        if (joinStatus === "pending") poker.cancelWait();
        poker.leave();

        if (started && chargedRef.current) {
            // Real cash-out. Settle against the SERVER-recorded final stack, with a
            // short retry: the settle HTTP call can race the leave over the socket,
            // and the server replies ready:false until the stack is recorded.
            const sid = sessionIdRef.current;
            let credited = 0;
            if (sid) {
                let r = await pokerSettle(sid);
                for (let i = 0; i < 5 && r && r.ready === false; i++) {
                    await sleep(400);
                    r = await pokerSettle(sid);
                }
                if (r && r.ready) credited = r.credited;
            }
            chargedRef.current = false;
            setHeldStake(null);
            await refreshWallet();
            return { settled: true, amount: credited };
        }

        if (chargedRef.current) {
            // Pre-game leave — the buy-in never hit the felt, so hand it straight
            // back (ledger stamps REFUND) using this session's own betAmount.
            await refundBet("POKER", sessionIdRef.current || undefined);
            chargedRef.current = false;
            setHeldStake(null);
            await refreshWallet();
            return { settled: false, amount: stakeRef.current };
        }

        await refreshWallet();
        return { settled: false, amount: 0 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started, joinStatus, poker, refundBet, refreshWallet]);

    const exitRoom = useCallback(async () => {
        const res = await settleRoom();
        // After a real cash-out, show the settled amount; otherwise go straight back.
        if (res.settled) setCashedOut(res.amount);
        else onExit();
    }, [settleRoom, onExit]);

    /* Leave guard — armed for the whole room session (entering / waiting /
       playing). Guards navbar & footer links plus browser Back; the in-UI
       LEAVE button keeps its own confirm. */
    const guardMessage = started
        ? `Your remaining stack of ₹${myStack} is settled to your wallet. Mid-hand, your hand is folded and the table plays on without you.`
        : heldStake != null
            ? `Your ₹${heldStake} buy-in returns to your wallet.`
            : "You haven't been charged yet — your seat request is simply withdrawn.";
    useLeaveGuard({
        when: phase !== "notfound" && phase !== "denied",
        title: "Leave the table?",
        message: guardMessage,
        actions: [
            { label: "Stay", tone: "ghost", leave: false },
            // The guard navigates away entirely after run(), so we don't show the
            // cash-out card here — settleRoom still settles/refunds the money.
            { label: "Leave & settle", tone: "ember", leave: true, run: async () => { await settleRoom(); } },
        ],
    });

    // On connect: create the room (host) or peek the room (joiner).
    useEffect(() => {
        if (!connected || initedRef.current) return;
        initedRef.current = true;
        if (start.mode === "create") {
            const amt = start.buyIn;
            (async () => {
                // Hold the buy-in over authenticated HTTP FIRST — this debits the
                // wallet and issues the secret seatToken. The "₹X held by the
                // house" copy is only honest once the server confirms the debit.
                const res = await pokerBuyIn(amt);
                if (!res) { setErr("Couldn't hold your buy-in — nothing was charged. Try again."); return; }
                sessionIdRef.current = res.sessionId;
                seatTokenRef.current = res.seatToken;
                chargedRef.current = true;
                stakeRef.current = amt;
                setHeldStake(amt);
                await refreshWallet();
                // THEN create the room over the socket, carrying the seatToken.
                poker.createRoom(amt, res.seatToken, async (c) => {
                    if (!c) {
                        // Room creation failed after the buy-in — hand it back
                        // (ledger stamps REFUND) and say so.
                        await refundBet("POKER", sessionIdRef.current || undefined);
                        chargedRef.current = false;
                        setHeldStake(null);
                        await refreshWallet();
                        setErr(`Couldn't create the room — your ₹${amt} buy-in has been returned.`);
                        return;
                    }
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

    // React to the host's decision once we're waiting. The buy-in was already
    // taken up front (on Enter), so admit simply seats us; a decline hands the
    // held buy-in straight back.
    useEffect(() => {
        if (joinStatus === "admitted") {
            setPhase("room");
        }
        if (joinStatus === "denied") {
            (async () => {
                if (chargedRef.current) {
                    await refundBet("POKER", sessionIdRef.current || undefined);
                    chargedRef.current = false;
                    setHeldStake(null);
                    await refreshWallet();
                }
                setPhase("denied");
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [joinStatus]);

    const submitJoin = async () => {
        setErr("");
        if (buyIn < 100) return setErr("Minimum buy-in is ₹100");
        if (buyIn > wallet) return setErr("Buy-in exceeds your balance");
        // Hold the buy-in over authenticated HTTP FIRST (debit + seatToken), THEN
        // ask the host for a seat. If declined/cancelled later, it's refunded.
        const res = await pokerBuyIn(buyIn);
        if (!res) { setErr("Couldn't hold your buy-in — nothing was charged. Try again."); return; }
        sessionIdRef.current = res.sessionId;
        seatTokenRef.current = res.seatToken;
        chargedRef.current = true;
        stakeRef.current = buyIn;
        setHeldStake(buyIn);
        await refreshWallet();
        poker.requestJoin(code, buyIn, res.seatToken, async (r) => {
            if (!r.ok) {
                // Couldn't reach the host after charging — hand the buy-in back.
                await refundBet("POKER", sessionIdRef.current || undefined);
                chargedRef.current = false;
                setHeldStake(null);
                await refreshWallet();
                setErr("Couldn't reach the host — your buy-in was returned. Try again.");
                return;
            }
            setHostName(r.hostName || hostName);
            setPhase("waiting");
        });
    };

    /* Give up waiting for the host — cancel the seat request and, since the
       buy-in is already held, refund it before returning to the lobby. */
    const cancelWaiting = async () => {
        poker.cancelWait();
        if (chargedRef.current) {
            await refundBet("POKER", sessionIdRef.current || undefined);
            chargedRef.current = false;
            setHeldStake(null);
        }
        await refreshWallet();
        onExit();
    };

    /* ----- cashed-out confirmation (after a real cash-out) ----- */
    if (cashedOut !== null) {
        return (
            <>
                <Navbar />
                <LobbyShell>
                    <div className="pk-panel-card">
                        <h2 className="pk-panel-card__h">Cashed out</h2>
                        <p className="pk-panel-card__p">
                            Your remaining stack of <strong>₹{cashedOut}</strong> has been settled to your wallet.
                        </p>
                        <button className="pk-cta" onClick={onExit}>Back to lobby</button>
                    </div>
                </LobbyShell>
                <Footer />
            </>
        );
    }

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
                            <p className="pk-lobby__hint">Your buy-in is held when you enter, and returned in full if {hostName} declines.</p>
                        </div>
                    )}

                    {phase === "waiting" && (
                        <div className="pk-panel-card pk-wait">
                            <div className="pk-spinner" />
                            <h2 className="pk-panel-card__h">Waiting for {hostName} to allow you<span className="pk-dots"><i>.</i><i>.</i><i>.</i></span></h2>
                            <p className="pk-panel-card__p">You&apos;ll join the table as soon as the host admits you. Your buy-in is held and returned in full if you cancel or the host declines.</p>
                            <button className="pk-mini pk-mini--wide" onClick={cancelWaiting}>Cancel</button>
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
                <Footer />
            </>
        );
    }

    /* ----- live table / host lobby ----- */
    return (
        <>
            <Navbar />
            <div className="pk-page pk-page--nav">
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
            <Footer />
        </>
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
            <Footer />
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
