"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { LogOut, Wallet, TrendingUp, Trophy, Receipt } from "lucide-react";
import "../../styles/Profile.css";

interface Transaction {
    _id: string;
    type: "BET" | "WIN" | "DEPOSIT" | "WITHDRAW";
    gameType?: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
    meta?: {
        betAmount?: number;
        multiplier?: number;
    };
}

interface ProfileData {
    user: {
        id: string;
        name: string;
        email: string;
        avatar: string;
        createdAt: string;
    };
    wallet: {
        balance: number;
        totalEarnings: number;
    };
    biggestWin: {
        amount: number;
        gameType: string;
        date: string;
        multiplier?: number;
    } | null;
}

interface PaginationData {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export default function ProfilePage() {
    const { user, logout, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [pagination, setPagination] = useState<PaginationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>("ALL");
    const [currentPage, setCurrentPage] = useState(1);

    const fetchProfile = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                setProfile(data);
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
    }, []);

    const fetchTransactions = useCallback(async (page: number, type?: string) => {
        try {
            setTransactionsLoading(true);
            const token = localStorage.getItem("token");
            if (!token) return;

            let url = `${process.env.NEXT_PUBLIC_API_URL}/transactions/me?page=${page}&limit=10`;
            if (type && type !== "ALL") {
                url += `&type=${type}`;
            }

            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
        } finally {
            setTransactionsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/");
            return;
        }

        if (user) {
            Promise.all([fetchProfile(), fetchTransactions(1)]).finally(() => {
                setLoading(false);
            });
        }
    }, [user, authLoading, router, fetchProfile, fetchTransactions]);

    const handleFilterChange = (filter: string) => {
        setActiveFilter(filter);
        setCurrentPage(1);
        fetchTransactions(1, filter);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        fetchTransactions(page, activeFilter);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatAmount = (amount: number) => {
        const prefix = amount >= 0 ? "+ " : "- ";
        return `${prefix}₹${Math.abs(amount).toFixed(2)}`;
    };

    if (authLoading || loading) {
        return (
            <div className="profile-page">
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <p>Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="profile-page">
            {/* Header */}
            <div className="profile-header">
                <h1>My Profile</h1>
                <button className="logout-btn" onClick={logout}>
                    <LogOut size={18} />
                    Logout
                </button>
            </div>

            {/* User Info */}
            <div className="user-info-section">
                <img
                    src={profile?.user.avatar || user.avatar}
                    alt={profile?.user.name || user.name}
                    className="user-avatar"
                />
                <div className="user-details">
                    <h2>{profile?.user.name || user.name}</h2>
                    <p>{profile?.user.email || user.email}</p>
                    {profile?.user.createdAt && (
                        <p className="member-since">
                            Member since {new Date(profile.user.createdAt).toLocaleDateString("en-IN", {
                                month: "long",
                                year: "numeric",
                            })}
                        </p>
                    )}
                </div>
            </div>

            {/* Wallet Summary */}
            <div className="wallet-summary">
                <div className="summary-card balance">
                    <div className="icon">💰</div>
                    <div className="label">Wallet Balance</div>
                    <div className="value">₹{(profile?.wallet.balance || 0).toFixed(2)}</div>
                </div>

                <div className="summary-card earnings">
                    <div className="icon">📈</div>
                    <div className="label">Total Earnings</div>
                    <div className={`value ${(profile?.wallet.totalEarnings || 0) < 0 ? 'negative' : ''}`}>
                        {(profile?.wallet.totalEarnings || 0) >= 0 ? '+' : ''}₹{(profile?.wallet.totalEarnings || 0).toFixed(2)}
                    </div>
                </div>

                <div className="summary-card biggest-win">
                    <div className="icon">🎉</div>
                    <div className="label">Biggest Win</div>
                    <div className="value">
                        {profile?.biggestWin ? `₹${profile.biggestWin.amount.toFixed(2)}` : "₹0.00"}
                    </div>
                    {profile?.biggestWin && (
                        <div className="biggest-win-details">
                            {profile.biggestWin.gameType}
                            {profile.biggestWin.multiplier && ` • ${profile.biggestWin.multiplier}x`}
                        </div>
                    )}
                </div>
            </div>

            {/* Transaction History */}
            <div className="transaction-section">
                <div className="transaction-header">
                    <h2>
                        <Receipt size={20} style={{ marginRight: "8px", verticalAlign: "middle" }} />
                        Transaction History
                    </h2>
                    <div className="filter-group">
                        {["ALL", "BET", "WIN", "DEPOSIT"].map((filter) => (
                            <button
                                key={filter}
                                className={`filter-btn ${activeFilter === filter ? "active" : ""}`}
                                onClick={() => handleFilterChange(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>

                {transactionsLoading ? (
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Loading transactions...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="empty-state">
                        <div className="icon">📋</div>
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <>
                        <table className="transaction-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Game</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((tx) => (
                                    <tr key={tx._id}>
                                        <td>{formatDate(tx.createdAt)}</td>
                                        <td>{tx.gameType || "-"}</td>
                                        <td>
                                            <span className={`type-badge ${tx.type.toLowerCase()}`}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        <td className={tx.amount >= 0 ? "amount-positive" : "amount-negative"}>
                                            {formatAmount(tx.amount)}
                                        </td>
                                        <td>₹{tx.balanceAfter.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {pagination && pagination.totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="pagination-btn"
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={!pagination.hasPrev}
                                >
                                    Previous
                                </button>
                                <span className="pagination-info">
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    className="pagination-btn"
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={!pagination.hasNext}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
