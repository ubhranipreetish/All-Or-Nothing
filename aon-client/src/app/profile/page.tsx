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
            <><Navbar /><div className="pfx"><div className="loading-state"><div className="loading-spinner" /><p>Opening your dossier…</p></div></div><Footer /></>
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
            <div className="pfx">
                <main className="pfx__wrap">
                    {/* ---- identity plate ---- */}
                    <section className="pfx-id">
                        <div className="pfx-id__top">
                            <span className="pfx-eyebrow"><i className="pfx-eyebrow__dot" />House dossier</span>
                            <button className="pfx-logout" onClick={logout}><LogOut size={13} /> Log out</button>
                        </div>
                        <h1 className="pfx-id__name">{profile?.user.name || user.name}</h1>
                        <div className="pfx-id__row">
                            <img src={profile?.user.avatar || user.avatar} alt={profile?.user.name || user.name} className="pfx-id__avatar" />
                            <div className="pfx-id__facts">
                                <span className="pfx-id__email">{profile?.user.email || user.email}</span>
                                <em className="pfx-id__tag">{since ? <>at the table since <b>{since}</b></> : <>new to the table</>}</em>
                            </div>
                            {rank && (
                                <div className="pfx-seal">
                                    <span>Rank</span>
                                    <b>#{rank}</b>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ---- the numbers ---- */}
                    <section className="pfx-strip">
                        <div className="pfx-strip__cell">
                            <span className="pfx-strip__label">Balance</span>
                            <span className="pfx-strip__num">₹{wallet.toFixed(2)}</span>
                            <span className="pfx-strip__note">ready to stake</span>
                        </div>
                        <div className="pfx-strip__cell">
                            <span className="pfx-strip__label">Net worth</span>
                            <span className={`pfx-strip__num ${netWorth < 0 ? "is-ember" : ""}`}>₹{netWorth.toFixed(2)}</span>
                            <span className="pfx-strip__note">balance − debts</span>
                        </div>
                        <div className="pfx-strip__cell">
                            <span className="pfx-strip__label">Lifetime P&L</span>
                            <span className={`pfx-strip__num ${totalEarnings < 0 ? "is-ember" : "is-gold"}`}>{totalEarnings >= 0 ? "+" : "−"}₹{Math.abs(totalEarnings).toFixed(2)}</span>
                            <span className="pfx-strip__note">every bet, settled</span>
                        </div>
                        <div className="pfx-strip__cell">
                            <span className="pfx-strip__label">Biggest win</span>
                            <span className="pfx-strip__num is-gold">{profile?.biggestWin ? `₹${profile.biggestWin.amount.toFixed(2)}` : "—"}</span>
                            <span className="pfx-strip__note">{profile?.biggestWin ? `on ${formatGame(profile.biggestWin.gameType)}` : "still hunting"}</span>
                        </div>
                    </section>

                    <div className="pfx-grid">
                        {/* ---- the ledger ---- */}
                        <section className="pfx-panel pfx-ledger" ref={transactionSectionRef}>
                            <header className="pfx-panel__head">
                                <div>
                                    <h2 className="pfx-panel__title">The Ledger</h2>
                                    <span className="pfx-panel__sub">every rupee, accounted for</span>
                                </div>
                                {showAllTransactions && (
                                    <div className="pfx-tabs">
                                        {["ALL", "BET", "WIN", "DEPOSIT"].map((filter) => (
                                            <button key={filter} className={activeFilter === filter ? "is-on" : ""} onClick={() => handleFilterChange(filter)}>{filter}</button>
                                        ))}
                                    </div>
                                )}
                            </header>

                            {transactionsLoading && displayedTransactions.length === 0 ? (
                                <div className="loading-state"><div className="loading-spinner" /><p>Loading…</p></div>
                            ) : displayedTransactions.length === 0 ? (
                                <p className="pfx-empty">The ledger is blank. Place your first bet and let it start talking.</p>
                            ) : (
                                <>
                                    <div className="pfx-ledger__scroll" style={{ opacity: transactionsLoading ? 0.4 : 1, transition: "opacity 0.3s ease", pointerEvents: transactionsLoading ? "none" : "auto" }}>
                                        <table>
                                            <thead><tr><th>Date</th><th>Game</th><th>Entry</th><th>Amount</th><th>Balance</th></tr></thead>
                                            <tbody>
                                                {displayedTransactions.map((tx) => (
                                                    <tr key={tx._id}>
                                                        <td>{formatDate(tx.createdAt)}</td>
                                                        <td>{getTransactionNote(tx) || formatGame(tx.gameType)}</td>
                                                        <td><span className={`pfx-stamp pfx-stamp--${tx.type.toLowerCase()}`}>{tx.type}</span></td>
                                                        <td className={tx.amount >= 0 ? "pfx-amt--in" : "pfx-amt--out"}>{formatAmount(tx.amount)}</td>
                                                        <td>₹{tx.balanceAfter.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {!showAllTransactions && transactions.length >= 5 && (
                                        <button className="pfx-more" onClick={handleSeeAll}><span>Open the full ledger</span><ChevronDown size={15} /></button>
                                    )}
                                    {showAllTransactions && pagination && pagination.totalPages > 1 && (
                                        <div className="pfx-pages">
                                            <button onClick={() => handlePageChange(currentPage - 1)} disabled={!pagination.hasPrev} aria-label="Previous page"><ChevronLeft size={17} /></button>
                                            <span>Page {pagination.page} / {pagination.totalPages}</span>
                                            <button onClick={() => handlePageChange(currentPage + 1)} disabled={!pagination.hasNext} aria-label="Next page"><ChevronRight size={17} /></button>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        <div className="pfx-rail">
                            {/* ---- debts to the house ---- */}
                            <section className="pfx-panel">
                                <header className="pfx-panel__head">
                                    <div>
                                        <h2 className="pfx-panel__title">Debts to the House</h2>
                                        <span className="pfx-panel__sub">10% daily interest, always collected</span>
                                    </div>
                                    <span className="pfx-count">{activeLoans.length}/2</span>
                                </header>
                                {activeLoans.length === 0 ? (
                                    <p className="pfx-empty">The house holds nothing over you. Borrow from the wallet up top — if you dare.</p>
                                ) : (
                                    <div>
                                        {activeLoans.map((loan) => {
                                            const repayAmount = loan.repaymentAmount ?? loan.amount;
                                            const interest = repayAmount - loan.amount;
                                            return (
                                                <div key={loan._id} className="pfx-loan">
                                                    <div className="pfx-loan__info">
                                                        <span className="pfx-loan__main">₹{loan.amount.toFixed(2)} owed — settle for <b>₹{repayAmount.toFixed(2)}</b></span>
                                                        <span className="pfx-loan__meta">
                                                            taken {new Date(loan.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                                            {interest > 0 && <> · +₹{interest.toFixed(2)} interest ({loan.interestDays ?? 1}d)</>}
                                                        </span>
                                                    </div>
                                                    <button className="pfx-repay" onClick={() => openRepayModal(loan)} disabled={repayingLoanId === loan._id || wallet < repayAmount} title={wallet < repayAmount ? `Need ₹${repayAmount.toFixed(2)}` : "Repay this loan"}>
                                                        {repayingLoanId === loan._id ? "…" : `Settle ₹${repayAmount.toFixed(0)}`}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* ---- the table ---- */}
                            <section className="pfx-panel">
                                <header className="pfx-panel__head">
                                    <div>
                                        <h2 className="pfx-panel__title">The Table</h2>
                                        <span className="pfx-panel__sub">where you stand tonight</span>
                                    </div>
                                    <Link className="pfx-panel__aside" href="/leaderboard">full standings →</Link>
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
                        </div>
                    </div>
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
