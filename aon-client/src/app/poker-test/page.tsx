"use client";

import PokerTable from "../../components/poker/PokerTable";
import { useLocalPoker } from "../../components/poker/useLocalPoker";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import "../../styles/Poker.css";

/**
 * /poker-test — backend-free harness. Runs the full poker engine + bots in the
 * browser so the UI and gameplay can be checked without the server. The "Leave"
 * button re-deals a fresh table.
 */
export default function PokerTestPage() {
    const { state, act, sitOut, sitIn, rebuy, newTable } = useLocalPoker("You", 3);

    return (
        <>
            <Navbar />
            <div className="pk-page pk-page--nav">
                <div className="pk-testbadge">TEST MODE · no backend · you vs 3 bots · play-money</div>
                {state ? (
                    <PokerTable
                        state={state}
                        onAct={act}
                        onLeave={newTable}
                        onSitOut={sitOut}
                        onSitIn={sitIn}
                        onRebuy={rebuy}
                    />
                ) : (
                    <div className="pk-loading">Dealing…</div>
                )}
            </div>
            <Footer />
        </>
    );
}
