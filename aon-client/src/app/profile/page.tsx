"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useWallet } from "../../contexts/WalletContext";
import { LogOut, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
    meta?: { betAmount?: number; multiplier?: number; bonusType?: string; description?: string };
}

interface ProfileData {
    user: { id: string; name: string; email: string; avatar: string; createdAt: string };
    wallet: { balance: number; totalEarnings: number };
    biggestWin: { amount: number; gameType: string; date: string; multiplier?: number } | null;
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
    page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean;
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
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile/me`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setProfile(await res.json());
        } catch (error) { console.error("Failed to fetch profile:", error); }
    }, []);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/leaderboard/all-time`);
            if (res.ok) { const data = await res.json(); setLeaderboard((data.leaderboard || []).slice(0, 10)); }
        } catch (error) { console.error("Failed to fetch leaderboard:", error); }
    }, []);

    const fetchTransactions = useCallback(async (page: number, type?: string, limit: number = 8) => {
        try {
            setTransactionsLoading(true);
            const token = localStorage.getItem("token");
            if (!token) return;
            let url = `${process.env.NEXT_PUBLIC_API_URL}/transactions/me?page=${page}&limit=${limit}`;
            if (type && type !== "ALL") url += `&type=${type}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setTransactions(data.transactions); setPagination(data.pagination); }
        } catch (error) { console.error("Failed to fetch transactions:", error); }
        finally { setTransactionsLoading(false); }
    }, []);

    useEffect(() => {
        if (!authLoading && !user) { router.push("/"); return; }
        if (user) {
            Promise.all([fetchProfile(), fetchTransactions(1, "ALL", 5), fetchLeaderboard(), refreshWallet()])
                .finally(() => setLoading(false));
        }
    }, [user, authLoading, router, fetchProfile, fetchTransactions, fetchLeaderboard, refreshWallet]);

    const transactionSectionRef = useRef<HTMLDivElement>(null);

    const handleFilterChange = (filter: string) => { setActiveFilter(filter); setCurrentPage(1); fetchTransactions(1, filter, showAllTransactions ? 8 : 5); };
    const handlePageChange = (page: number) => { setCurrentPage(page); fetchTransactions(page, activeFilter, 8); setTimeout(() => transactionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); };
    const handleSeeAll = () => { setShowAllTransactions(true); setCurrentPage(1); fetchTransactions(1, activeFilter, 8); };

    const openRepayModal = (loan: { _id: string; amount: number; repaymentAmount?: number; interestDays?: number }) => { setSelectedLoan(loan); setRepayState("confirm"); setShowRepayModal(true); };
    const closeRepayModal = () => { setShowRepayModal(false); setSelectedLoan(null); setRepayState("confirm"); };
    const handleConfirmRepay = async () => {
        if (!selectedLoan) return;
        setRepayState("processing"); setRepayingLoanId(selectedLoan._id);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const success = await repayLoan(selectedLoan._id);
        setRepayingLoanId(null);
        if (success) { setRepayState("success"); fetchProfile(); setTimeout(() => closeRepayModal(), 1000); }
        else { setRepayState("confirm"); alert("Failed to repay loan. Make sure you have sufficient balance."); }
    };

    const formatDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const formatAmount = (amount: number) => `${amount >= 0 ? "+ " : "- "}₹${Math.abs(amount).toFixed(2)}`;
    const getTransactionNote = (tx: Transaction) => {
        if (tx.meta?.bonusType === "WELCOME_100") return "Welcome Bonus";
        if (tx.meta?.bonusType === "LOAN") return "Loan Taken";
        if (tx.meta?.bonusType === "LOAN_REPAY") return "Loan Repaid";
        return null;
    };
    const formatGame = (g?: string) => (g ? g.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ") : "-");
    const getUserRank = () => (user ? leaderboard.find((e) => e.userId === user.id)?.rank ?? null : null);

    if (authLoading || loading) {
        return (
            <><Navbar /><div className="pf2"><div className="loading-state"><div className="loading-spinner" /><p>Loading profile…</p></div></div><Footer /></>
        );
    }
    if (!user) return null;

    const medals = ["I", "II", "III"];
    const displayedTransactions = showAllTransactions ? transactions : transactions.slice(0, 5);
    const owed = activeLoans.reduce((s, l) => s + (l.repaymentAmount ?? l.amount), 0);
    const netWorth = wallet - owed;
    const rank = getUserRank();
    const since = profile?.user.createdAt ? new Date(profile.user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : null;

    return (
        <>
            <Navbar />
            <div className="pf2">
                <main className="pf2__wrap">
                    {/* identity */}
                    <section className="pf2__hero">
                        <div className="pf2__heroL">
                            <img src={profile?.user.avatar || user.avatar} alt={profile?.user.name || user.name} className="pf2__avatar" />
                            <div className="pf2__idtext">
                                <h1 className="pf2__name">{profile?.user.name || user.name}</h1>
                                <p className="pf2__email">{profile?.user.email || user.email}</p>
                                <p className="pf2__meta">
                                    {since && <>Member since {since}</>}
                                    {rank && <> · <span className="pf2__rankchip">Rank #{rank}</span></>}
                                </p>
                            </div>
                        </div>
                        <button className="pf2__logout" onClick={logout}><LogOut size={15} /> Log out</button>
                    </section>

                    {/* key stats */}
                    <section className="pf2__stats">
                        <div className="pf2__stat">
                            <span>Balance</span>
                            <b>₹{wallet.toFixed(2)}</b>
                            <i>available to play</i>
                        </div>
                        <div className="pf2__stat">
                            <span>Net worth</span>
                            <b className={netWorth < 0 ? "neg" : ""}>₹{netWorth.toFixed(2)}</b>
                            <i>balance − loans</i>
                        </div>
                        <div className="pf2__stat">
                            <span>Total earnings</span>
                            <b className={totalEarnings < 0 ? "neg" : "pos"}>{totalEarnings >= 0 ? "+" : "−"}₹{Math.abs(totalEarnings).toFixed(2)}</b>
                            <i>lifetime profit / loss</i>
                        </div>
                        <div className="pf2__stat">
                            <span>Biggest win</span>
                            <b className="gold">{profile?.biggestWin ? `₹${profile.biggestWin.amount.toFixed(2)}` : "—"}</b>
                            <i>{profile?.biggestWin ? formatGame(profile.biggestWin.gameType) : "no wins yet"}</i>
                        </div>
                    </section>

                    {/* leaderboard + loans */}
                    <div className="pf2__cols">
                        <section className="pf2__card">
                            <header className="pf2__cardhead">
                                <h2>Leaderboard</h2>
                                <Link className="pf2__link" href="/leaderboard">View all →</Link>
                            </header>
                            <div className="leaderboard-list">
                                {leaderboard.slice(0, 5).map((entry) => (
                                    <div key={entry.userId} className={`leaderboard-item ${entry.userId === user.id ? "is-you" : ""} ${entry.rank <= 3 ? `is-top is-top-${entry.rank}` : ""}`}>
                                        <span className={`rank rank-${entry.rank}`}>{entry.rank <= 3 ? medals[entry.rank - 1] : entry.rank}</span>
                                        <img src={entry.avatar} alt={entry.username} className="lb-avatar" />
                                        <span className="lb-name">{entry.username}{entry.userId === user.id && <span className="you-badge">You</span>}</span>
                                        <span className={`lb-earnings ${entry.netWorth < 0 ? "negative" : ""}`}>{entry.netWorth >= 0 ? "+" : ""}₹{entry.netWorth.toFixed(0)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="pf2__card">
                            <header className="pf2__cardhead">
                                <h2>Active loans</h2>
                                <span className="pf2__pill">{activeLoans.length}/2</span>
                            </header>
                            {activeLoans.length === 0 ? (
                                <p className="pf2__empty">No active loans. Borrow anytime from the wallet up top — repaid with 10% daily interest.</p>
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
                                                        {interest > 0 && <span className="interest-badge">+₹{interest.toFixed(2)} ({loan.interestDays ?? 1}d)</span>}
                                                    </span>
                                                    <span className="loan-date">Taken: {new Date(loan.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                                                </div>
                                                <button className="repay-btn" onClick={() => openRepayModal(loan)} disabled={repayingLoanId === loan._id || wallet < repayAmount} title={wallet < repayAmount ? `Need ₹${repayAmount.toFixed(2)}` : "Repay this loan"}>
                                                    {repayingLoanId === loan._id ? "…" : `Repay ₹${repayAmount.toFixed(0)}`}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* activity */}
                    <section className="pf2__card" ref={transactionSectionRef}>
                        <header className="pf2__cardhead">
                            <h2>{showAllTransactions ? "Transaction history" : "Recent activity"}</h2>
                            {showAllTransactions && (
                                <div className="filter-group">
                                    {["ALL", "BET", "WIN", "DEPOSIT"].map((filter) => (
                                        <button key={filter} className={`filter-btn ${activeFilter === filter ? "active" : ""}`} onClick={() => handleFilterChange(filter)}>{filter}</button>
                                    ))}
                                </div>
                            )}
                        </header>

                        {transactionsLoading && displayedTransactions.length === 0 ? (
                            <div className="loading-state"><div className="loading-spinner" /><p>Loading…</p></div>
                        ) : displayedTransactions.length === 0 ? (
                            <p className="pf2__empty">No transactions yet — place your first bet to get started.</p>
                        ) : (
                            <>
                                <table className="transaction-table" style={{ opacity: transactionsLoading ? 0.4 : 1, transition: "opacity 0.3s ease", pointerEvents: transactionsLoading ? "none" : "auto" }}>
                                    <thead><tr><th>Date</th><th>Game</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead>
                                    <tbody>
                                        {displayedTransactions.map((tx) => (
                                            <tr key={tx._id}>
                                                <td data-label="Date">{formatDate(tx.createdAt)}</td>
                                                <td data-label="Game">{getTransactionNote(tx) || formatGame(tx.gameType)}</td>
                                                <td data-label="Type"><span className={`type-badge ${tx.type.toLowerCase()}`}>{tx.type}</span></td>
                                                <td data-label="Amount" className={tx.amount >= 0 ? "amount-positive" : "amount-negative"}>{formatAmount(tx.amount)}</td>
                                                <td data-label="Balance">₹{tx.balanceAfter.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {!showAllTransactions && transactions.length >= 5 && (
                                    <button className="see-all-btn" onClick={handleSeeAll}><span>See all transactions</span><ChevronDown size={18} /></button>
                                )}
                                {showAllTransactions && pagination && pagination.totalPages > 1 && (
                                    <div className="pagination">
                                        <button className="pagination-btn" onClick={() => handlePageChange(currentPage - 1)} disabled={!pagination.hasPrev}><ChevronLeft size={20} /></button>
                                        <span className="pagination-info">Page {pagination.page} of {pagination.totalPages}</span>
                                        <button className="pagination-btn" onClick={() => handlePageChange(currentPage + 1)} disabled={!pagination.hasNext}><ChevronRight size={20} /></button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </main>
            </div>

            {/* Repay Loan Modal */}
            {showRepayModal && selectedLoan && (
                <div className="modal-overlay" onClick={closeRepayModal}>
                    <div className="modal-content modal-3d loan-modal" onClick={(e) => e.stopPropagation()}>
                        {repayState === "confirm" && (
                            <>
                                <h3>Repay loan</h3>
                                <p className="loan-subtitle">Confirm your loan repayment.</p>
                                <div className="repay-info">
                                    <div className="repay-principal"><span>Principal</span><span>₹{selectedLoan.amount.toFixed(2)}</span></div>
                                    <div className="repay-interest"><span>Interest ({selectedLoan.interestDays ?? 1} day{(selectedLoan.interestDays ?? 1) > 1 ? "s" : ""})</span><span>₹{((selectedLoan.repaymentAmount ?? selectedLoan.amount) - selectedLoan.amount).toFixed(2)}</span></div>
                                    <div className="repay-total"><span>Total repay</span><span>₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)}</span></div>
                                </div>
                                <div className="modal-buttons">
                                    <button className="modal-cancel" onClick={closeRepayModal}>Cancel</button>
                                    <button className="modal-confirm" onClick={handleConfirmRepay} disabled={walletLoading || wallet < (selectedLoan.repaymentAmount ?? selectedLoan.amount)}>Confirm repay</button>
                                </div>
                            </>
                        )}
                        {repayState === "processing" && (
                            <div className="loan-processing"><div className="processing-spinner" /><h3>Processing…</h3><p>Repaying ₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)}</p></div>
                        )}
                        {repayState === "success" && (
                            <div className="loan-success"><div className="success-icon">✅</div><h3>Loan repaid</h3><p className="success-amount">₹{(selectedLoan.repaymentAmount ?? selectedLoan.amount).toFixed(2)} deducted</p><p className="success-hint">Principal added back to your net worth</p></div>
                        )}
                    </div>
                </div>
            )}

            <Footer />
        </>
    );
}
