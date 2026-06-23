"use client";

import { useEffect, useState } from "react";
import { usePoker } from "../../components/poker/usePoker";
import PokerTable from "../../components/poker/PokerTable";
import "../../styles/Poker.css";

/* The live room: connects, performs the initial join, renders the table. */
function PokerRoom({
    name,
    join,
    onExit,
}: {
    name: string;
    join: { mode: "quick" } | { mode: "code"; code: string };
    onExit: () => void;
}) {
    const { state, connected, error, quickJoin, joinTable, leave, act, sitOut, sitIn, rebuy } = usePoker(name);
    const [joined, setJoined] = useState(false);

    useEffect(() => {
        if (connected && !joined) {
            if (join.mode === "quick") quickJoin();
            else joinTable(join.code);
            setJoined(true);
        }
    }, [connected, joined, join, quickJoin, joinTable]);

    // Persist the live table so a full page refresh rejoins it (the server also
    // holds the seat for a grace period).
    useEffect(() => {
        if (state?.tableId) {
            localStorage.setItem("aon_poker_last", JSON.stringify({ name, tableId: state.tableId, ts: Date.now() }));
        }
    }, [state?.tableId, name]);

    const exit = () => {
        leave();
        localStorage.removeItem("aon_poker_last");
        onExit();
    };

    return (
        <div className="pk-page">
            {error && <div className="pk-toast">{error}</div>}
            {!connected && <div className="pk-loading">Connecting…</div>}
            {connected && !state && (
                <div className="pk-loading">
                    Taking a seat…
                    <button className="pk-mini" style={{ marginLeft: 12 }} onClick={exit}>
                        Back to lobby
                    </button>
                </div>
            )}
            {connected && state && (
                <PokerTable
                    state={state}
                    onAct={act}
                    onLeave={exit}
                    onSitOut={sitOut}
                    onSitIn={sitIn}
                    onRebuy={rebuy}
                />
            )}
        </div>
    );
}

export default function PokerPage() {
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [session, setSession] = useState<null | { name: string; join: { mode: "quick" } | { mode: "code"; code: string } }>(
        null,
    );

    // Auto-rejoin the last table after a refresh (within 2 minutes).
    useEffect(() => {
        try {
            const raw = localStorage.getItem("aon_poker_last");
            if (!raw) return;
            const last = JSON.parse(raw) as { name: string; tableId: string; ts: number };
            if (last.tableId && Date.now() - last.ts < 120000) {
                setSession({ name: last.name, join: { mode: "code", code: last.tableId } });
            }
        } catch {
            /* ignore */
        }
    }, []);

    if (session) {
        return <PokerRoom name={session.name} join={session.join} onExit={() => setSession(null)} />;
    }

    const playerName = name.trim() || "Guest";

    return (
        <div className="pk-page">
            <div className="pk-lobby">
                <h1 className="pk-lobby__title">
                    POKER <span>· All or Nothing</span>
                </h1>
                <p className="pk-lobby__sub">
                    No-limit Texas Hold&apos;em · up to 6 players · real-time. Play money chips
                    (₵), 1000 to start.
                </p>

                <label className="pk-field">
                    <span>Display name</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Guest"
                        maxLength={18}
                    />
                </label>

                <button
                    className="pk-cta"
                    onClick={() => setSession({ name: playerName, join: { mode: "quick" } })}
                >
                    Quick Play
                </button>

                <div className="pk-or">or join with a code</div>

                <div className="pk-join">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="ABCD"
                        maxLength={4}
                    />
                    <button
                        disabled={code.trim().length < 4}
                        onClick={() => setSession({ name: playerName, join: { mode: "code", code: code.trim() } })}
                    >
                        Join
                    </button>
                </div>

                <p className="pk-lobby__hint">
                    Tip: open this page in two browser tabs (or share the table code) to test a
                    real multiplayer hand.
                </p>
            </div>
        </div>
    );
}
