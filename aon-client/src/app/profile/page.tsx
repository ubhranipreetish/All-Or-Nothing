"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useWallet } from "../../contexts/WalletContext";
import { LogOut, Receipt, ChevronDown, Trophy, CreditCard } from "lucide-react";
import "../../styles/Profile.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
        bonusType?: string;
        description?: string;
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

interface LeaderboardUser {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    netWorth: number;
    walletBalance: number;
    loansToRepay: number;
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
    const { wallet, totalEarnings, activeLoans, repayLoan, loading: walletLoading, refreshWallet } = useWallet();
    const router = useRouter();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
    const [pagination, setPagination] = useState<PaginationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>("ALL");
    const [currentPage, setCurrentPage] = useState(1);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [repayingLoanId, setRepayingLoanId] = useState<string | null>(null);
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [selectedLoan, setSelectedLoan] = useState<{ _id: string; amount: number; repaymentAmount?: number; interestDays?: number } | null>(null);
    const [repayState, setRepayState] = useState<"confirm" | "processing" | "success">("confirm");

    const fetchProfile = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setProfile(data);
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
    }, []);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/leaderboard/all-time`);
            if (res.ok) {
                const data = await res.json();
                setLeaderboard(data.leaderboard.slice(0, 10)); // Top 10
            }
        } catch (error) {
            console.error("Failed to fetch leaderboard:", error);
        }
    }, []);

    const fetchTransactions = useCallback(async (page: number, type?: string, limit: number = 10) => {
        try {
            setTransactionsLoading(true);
            const token = localStorage.getItem("token");
            if (!token) return;

            let url = `${process.env.NEXT_PUBLIC_API_URL}/transactions/me?page=${page}&limit=${limit}`;
            if (type && type !== "ALL") {
                url += `&type=${type}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
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
            Promise.all([
                fetchProfile(),
                fetchTransactions(1, "ALL", 5),
                fetchLeaderboard(),
                refreshWallet(),
            ]).finally(() => {
                setLoading(false);
            });
        }
    }, [user, authLoading, router, fetchProfile, fetchTransactions, fetchLeaderboard, refreshWallet]);

    const handleFilterChange = (filter: string) => {
        setActiveFilter(filter);
        setCurrentPage(1);
        fetchTransactions(1, filter, showAllTransactions ? 10 : 5);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        fetchTransactions(page, activeFilter, 10);
    };

    const handleSeeAll = () => {
        setShowAllTransactions(true);
        setCurrentPage(1);
        fetchTransactions(1, activeFilter, 10);
    };

    const openRepayModal = (loan: { _id: string; amount: number; repaymentAmount?: number; interestDays?: number }) => {
        setSelectedLoan(loan);
        setRepayState("confirm");
        setShowRepayModal(true);
    };

    const closeRepayModal = () => {
        setShowRepayModal(false);
        setSelectedLoan(null);
        setRepayState("confirm");
    };

    const handleConfirmRepay = async () => {
        if (!selectedLoan) return;

        setRepayState("processing");
        setRepayingLoanId(selectedLoan._id);

        // Wait 0.5 second for visual feedback
        await new Promise(resolve => setTimeout(resolve, 500));

        const success = await repayLoan(selectedLoan._id);
        setRepayingLoanId(null);

        if (success) {
            setRepayState("success");
            fetchProfile();
            // Auto close after 1 second
            setTimeout(() => {
                closeRepayModal();
            }, 1000);
        } else {
            setRepayState("confirm");
            alert("Failed to repay loan. Make sure you have sufficient balance.");
        }
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

    const getTransactionNote = (tx: Transaction) => {
        if (tx.meta?.bonusType === "WELCOME_100") return "Welcome Bonus";
        if (tx.meta?.bonusType === "LOAN") return "Loan Taken";
        if (tx.meta?.bonusType === "LOAN_REPAY") return "Loan Repaid";
        return null;
    };

    const getUserRank = () => {
        if (!user || !leaderboard.length) return null;
        const userEntry = leaderboard.find((entry) => entry.userId === user.id);
        return userEntry?.rank || null;
    };

    if (authLoading || loading) {
        return (
            <>
                <Navbar />
                <div className="profile-page">
                    <div className="loading-state">
                        <div className="loading-spinner"></div>
                        <p>Loading profile...</p>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    if (!user) return null;

    const displayedTransactions = showAllTransactions ? transactions : transactions.slice(0, 5);

    return (
        <>
            <Navbar />
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

                {/* Leaderboard + Wallet Section */}
                <div className="leaderboard-wallet-section">
                    {/* Leaderboard (Left) */}
                    <div className="leaderboard-card">
                        <h3>
                            <Trophy size={20} />
                            Net Worth Leaderboard
                        </h3>
                        <div className="leaderboard-list">
                            {leaderboard.map((entry) => (
                                <div
                                    key={entry.userId}
                                    className={`leaderboard-item ${entry.userId === user.id ? 'is-you' : ''}`}
                                >
                                    <span className={`rank rank-${entry.rank}`}>
                                        {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                                    </span>
                                    <img src={entry.avatar} alt={entry.username} className="lb-avatar" />
                                    <span className="lb-name">
                                        {entry.username}
                                        {entry.userId === user.id && <span className="you-badge">You</span>}
                                    </span>
                                    <span className={`lb-earnings ${entry.netWorth < 0 ? 'negative' : ''}`}>
                                        {entry.netWorth >= 0 ? '+' : ''}₹{entry.netWorth.toFixed(0)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {getUserRank() && getUserRank()! > 10 && (
                            <div className="your-rank-note">
                                Your rank: #{getUserRank()}
                            </div>
                        )}
                    </div>

                    {/* Wallet + Loans (Right) */}
                    <div className="wallet-loans-card">
                        <h3>
                            <CreditCard size={20} />
                            Wallet & Loans
                        </h3>

                        {/* Wallet Stats */}
                        <div className="wallet-stats">
                            <div className="stat-item">
                                <span className="stat-label">💰 Balance</span>
                                <span className="stat-value balance">₹{wallet.toFixed(2)}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">📈 Total Earnings</span>
                                <span className={`stat-value ${totalEarnings < 0 ? 'negative' : 'positive'}`}>
                                    {totalEarnings >= 0 ? '+' : ''}₹{totalEarnings.toFixed(2)}
                                </span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">🎉 Biggest Win</span>
                                <span className="stat-value golden">
                                    {profile?.biggestWin ? `₹${profile.biggestWin.amount.toFixed(2)}` : "₹0.00"}
                                </span>
                            </div>
                        </div>

                        {/* Active Loans */}
                        <div className="active-loans">
                            <h4>Active Loans ({activeLoans.length}/2)</h4>
                            {activeLoans.length === 0 ? (
                                <p className="no-loans">No active loans</p>
                            ) : (
                                <div className="loans-list">
                                    {activeLoans.map((loan) => {
                                        const repayAmount = loan.repaymentAmount ?? loan.amount;
                                        const interest = repayAmount - loan.amount;
                                        return (
                                            <div key={loan._id} className="loan-item">
                                                <div className="loan-info">
                                                    <span className="loan-principal">Principal: ₹{loan.amount.toFixed(2)}</span>
                                                    <span className="loan-repay-amount">
                                                        Repay: ₹{repayAmount.toFixed(2)}
                                                        {interest > 0 && (
                                                            <span className="interest-badge">
                                                                +₹{interest.toFixed(2)} ({loan.interestDays ?? 1}d)
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="loan-date">
                                                        Taken: {new Date(loan.createdAt).toLocaleDateString("en-IN", {
                                                            day: "2-digit",
                                                            month: "short",
                                                        })}
                                                    </span>
                                                </div>
                                                <button
                                                    className="repay-btn"
                                                    onClick={() => openRepayModal(loan)}
                                                    disabled={repayingLoanId === loan._id || wallet < repayAmount}
                                                    title={wallet < repayAmount ? `Need ₹${repayAmount.toFixed(2)}` : "Repay this loan"}
                                                >
                                                    {repayingLoanId === loan._id ? "..." : `₹${repayAmount.toFixed(0)}`}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="transaction-section">
                    <div className="transaction-header">
                        <h2>
                            <Receipt size={20} style={{ marginRight: "8px", verticalAlign: "middle" }} />
                            {showAllTransactions ? "Transaction History" : "Recent Transactions"}
                        </h2>
                        {showAllTransactions && (
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
                        )}
                    </div>

                    {transactionsLoading ? (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Loading transactions...</p>
                        </div>
                    ) : displayedTransactions.length === 0 ? (
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
                                    {displayedTransactions.map((tx) => (
                                        <tr key={tx._id}>
                                            <td>{formatDate(tx.createdAt)}</td>
                                            <td>{getTransactionNote(tx) || tx.gameType || "-"}</td>
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

                            {!showAllTransactions && transactions.length >= 5 && (
                                <button className="see-all-btn" onClick={handleSeeAll}>
                                    <span>See All Transactions</span>
                                    <ChevronDown size={18} />
                                </button>
                            )}

                            {showAllTransactions && pagination && pagination.totalPages > 1 && (
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

            {/* Repay Loan Modal */}
            {showRepayModal && selectedLoan && (
                <div className="modal-overlay" onClick={closeRepayModal}>
                    <div className="modal-content modal-3d loan-modal" onClick={(e) => e.stopPropagation()}>
                        {repayState === "confirm" && (
                            <>
                                <h3>💳 Repay Loan</h3>
                                <p className="loan-subtitle">Confirm your loan repayment</p>

                                <div className="repay-info">
                                    <div className="repay-principal">
                                        <span>Principal:</span>
                                        <span>₹{selectedLoan.amount.toFixed(2)}</span>
                                    </div>
                                    <div className="repay-interest">
                                        <span>Interest ({selectedLoan.interestDays ?? 1} day{(selectedLoan.interestDays ?? 1) > 1 ? 's' : ''}):</span>
                                        <span>₹{((selectedLoan.repaymentAmount ?? selectedLoan.amount) - selectedLoan.amount).toFixed(2)}</span>
                                    </div>
                                    <div className="repay-total">
                                        <span>Total Repay:</span>
                                        <span>₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="modal-buttons">
                                    <button className="modal-cancel" onClick={closeRepayModal}>
                                        Cancel
                                    </button>
                                    <button
                                        className="modal-confirm"
                                        onClick={handleConfirmRepay}
                                        disabled={walletLoading || wallet < (selectedLoan.repaymentAmount ?? selectedLoan.amount)}
                                    >
                                        Confirm Repay
                                    </button>
                                </div>
                            </>
                        )}

                        {repayState === "processing" && (
                            <div className="loan-processing">
                                <div className="processing-spinner"></div>
                                <h3>Processing...</h3>
                                <p>Repaying ₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)}</p>
                            </div>
                        )}

                        {repayState === "success" && (
                            <div className="loan-success">
                                <div className="success-icon">✅</div>
                                <h3>Loan Repaid!</h3>
                                <p className="success-amount">₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)} deducted</p>
                                <p className="success-hint">Principal added back to leaderboard</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Footer />
        </>
    );
}
