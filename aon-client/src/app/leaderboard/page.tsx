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
    const myRank = user ? leaderboard.find((e) => e.userId === user.id)?.rank : null;

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
                                    >
                                        <span className={`rank rank-${entry.rank}`}>
                                            {entry.rank <= 3 ? medals[entry.rank - 1] : entry.rank}
                                        </span>
                                        <img src={entry.avatar} alt={entry.username} className="lb-avatar" />
                                        <span className="lb-name">
                                            {entry.username}
                                            {user && entry.userId === user.id && <span className="you-badge">You</span>}
                                        </span>
                                        <span className={`lb-earnings ${entry.netWorth < 0 ? "negative" : ""}`}>
                                            {entry.netWorth >= 0 ? "+" : ""}₹{entry.netWorth.toFixed(0)}
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
