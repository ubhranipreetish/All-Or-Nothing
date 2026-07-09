"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "../../contexts/AuthContext";
import "../../styles/Profile.css";

interface LeaderboardUser {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    netWorth: number;
    walletBalance: number;
    loansToRepay: number;
}

export default function LeaderboardPage() {
    const { user } = useAuth();
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/leaderboard/all-time`);
                if (res.ok) {
                    const data = await res.json();
                    setLeaderboard(data.leaderboard || []);
                }
            } catch (err) {
                console.error("Failed to fetch leaderboard:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const medals = ["I", "II", "III"];
    // Rank shown in the header comes from the same array we render, so it
    // always matches the row position (server assigns rank = sorted index + 1).
    const myRank = user ? leaderboard.find((e) => e.userId === user.id)?.rank ?? null : null;

    // Whole rupees with Indian digit grouping — matches "The Table" on the profile.
    const formatNetWorth = (n: number) => `${n < 0 ? "−" : "+"}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

    // Display names aren't unique (two accounts can both be "Preetish Ubhrani").
    // The API only returns name + avatar + ids, so distinguish duplicates with a
    // masked account-id suffix rather than inventing data.
    const dupNames = new Set(
        leaderboard.filter((e, _, arr) => arr.some((o) => o.userId !== e.userId && o.username === e.username)).map((e) => e.username)
    );

    return (
        <>
            <Navbar />
            <div className="profile-page">
                <div className="pf-glow" aria-hidden="true"></div>

                <div className="profile-header">
                    <div className="profile-header__lead">
                        <span className="pf-eyebrow"><span className="pf-eyebrow__dot"></span>Rankings</span>
                        <h1>The <em>Leaderboard</em></h1>
                    </div>
                    {myRank && <div className="your-rank-note">Your rank: #{myRank}</div>}
                </div>

                <div className="leaderboard-wallet-section" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="leaderboard-card">
                        <div className="pf-card-head">
                            <span className="pf-card-head__icon"><Trophy size={16} /></span>
                            <div>
                                <span className="pf-label">Net worth = balance − loans owed</span>
                                <h3>Top Players</h3>
                            </div>
                        </div>

                        {loading ? (
                            <div className="loading-state"><div className="loading-spinner"></div><p>Loading…</p></div>
                        ) : leaderboard.length === 0 ? (
                            <div className="empty-state"><p>No players ranked yet.</p></div>
                        ) : (
                            <div className="leaderboard-list">
                                {leaderboard.map((entry) => (
                                    <div
                                        key={entry.userId}
                                        className={`leaderboard-item ${user && entry.userId === user.id ? "is-you" : ""} ${entry.rank <= 3 ? `is-top is-top-${entry.rank}` : ""}`}
                                        title={`Rank #${entry.rank} — ${entry.username}`}
                                    >
                                        <span className={`rank rank-${entry.rank}`}>
                                            {entry.rank <= 3 ? medals[entry.rank - 1] : String(entry.rank).padStart(2, "0")}
                                        </span>
                                        <img src={entry.avatar} alt={entry.username} className="lb-avatar" />
                                        <span className="lb-name">
                                            {entry.username}
                                            {user && entry.userId === user.id && <span className="you-badge">You</span>}
                                            {dupNames.has(entry.username) && !(user && entry.userId === user.id) && (
                                                <span className="lb-disc">#{String(entry.userId).slice(-4)}</span>
                                            )}
                                        </span>
                                        <span className={`lb-earnings ${entry.netWorth < 0 ? "negative" : ""}`}>
                                            {formatNetWorth(entry.netWorth)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <Footer />
        </>
    );
}
