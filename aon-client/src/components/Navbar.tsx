"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import { GoogleLogin } from "@react-oauth/google";
import { Wallet, Plus, Gift, AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import "../styles/Navbar.css";

export default function Navbar() {
    const { wallet, loading, hasClaimed100Bonus, claimWelcomeBonus, activeLoansCount, canTakeLoan, takeLoan } = useWallet();
    const { user, login } = useAuth();
    const router = useRouter();
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [loanAmount, setLoanAmount] = useState("");
    const [error, setError] = useState("");
    const [scrolled, setScrolled] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [showGames, setShowGames] = useState(false);

    const GAMES = [
        { name: "Mines", href: "/mines" },
        { name: "Dragon Tower", href: "/dragon-tower" },
        { name: "Fortune Wheel", href: "/wheel" },
        { name: "Roulette", href: "/roulette" },
        { name: "Poker", href: "/poker" },
    ];
    const goto = (href: string) => { setShowGames(false); router.push(href); };

    // Hover-open with a grace period: momentary leaves (crossing the gap
    // between button and menu, cursor jitter) no longer slam the menu shut.
    const gamesCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openGames = () => {
        if (gamesCloseTimer.current) clearTimeout(gamesCloseTimer.current);
        setShowGames(true);
    };
    const scheduleCloseGames = () => {
        if (gamesCloseTimer.current) clearTimeout(gamesCloseTimer.current);
        gamesCloseTimer.current = setTimeout(() => setShowGames(false), 200);
    };
    useEffect(() => () => {
        if (gamesCloseTimer.current) clearTimeout(gamesCloseTimer.current);
    }, []);
    const [loanState, setLoanState] = useState<"input" | "processing" | "success">("input");
    const [loanedAmount, setLoanedAmount] = useState(0);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Reserve layout space under the fixed navbar while a promo banner shows,
    // so page content starts below the banner instead of underneath it.
    const promoVisible = !user || !hasClaimed100Bonus;
    useEffect(() => {
        document.body.classList.toggle("has-promo", promoVisible);
        return () => document.body.classList.remove("has-promo");
    }, [promoVisible]);

    const handleTakeLoan = async () => {
        const amount = parseFloat(loanAmount) || 0;
        if (amount <= 0) { setError("Please enter a valid amount greater than 0"); return; }
        if (amount > 10000000) { setError("Maximum loan amount is ₹1,00,00,000"); return; }
        setLoanState("processing");
        setLoanedAmount(amount);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const success = await takeLoan(amount);
        if (success) {
            setLoanState("success");
            setLoanAmount("");
            setError("");
            setTimeout(() => handleCloseModal(), 1000);
        } else {
            setLoanState("input");
            setError("Failed to take loan. Please try again.");
        }
    };

    const handleCloseModal = () => {
        setShowLoanModal(false);
        setLoanAmount("");
        setError("");
        setLoanState("input");
        setLoanedAmount(0);
    };

    const handleClaimBonus = async () => {
        setClaiming(true);
        const success = await claimWelcomeBonus();
        setClaiming(false);
        if (!success) alert("Failed to claim bonus. Please try again.");
    };

    return (
        <>
            <nav className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
                <div className="navbar-container">
                    {/* left — logo + games menu */}
                    <div className="nav-left">
                        <div className="logo" onClick={() => router.push("/")}>
                            <img src="/images/aon-logo.png" alt="All Or Nothing" />
                        </div>
                        <div className="nav-games" onMouseEnter={openGames} onMouseLeave={scheduleCloseGames}>
                            <button className="nav-games__btn" onClick={() => setShowGames((s) => !s)} aria-haspopup="true" aria-expanded={showGames}>
                                Games <span className="nav-games__caret">▾</span>
                            </button>
                            {showGames && (
                                <div className="nav-games__menu">
                                    {GAMES.map((g) => (
                                        <button key={g.href} className="nav-games__item" onClick={() => goto(g.href)}>{g.name}</button>
                                    ))}
                                    <div className="nav-games__sep" />
                                    <button className="nav-games__item" onClick={() => goto("/leaderboard")}>Leaderboard</button>
                                    <button className="nav-games__item" onClick={() => goto("/profile")}>My Profile</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* center — wallet + take-loan */}
                    <div className="nav-center">
                        {user && (
                            <div className="wallet-pill">
                                <Wallet size={17} className="wallet-pill__icon" />
                                <span className="wallet-pill__amt">₹{wallet.toFixed(2)}</span>
                                <button className="wallet-pill__add" onClick={() => setShowLoanModal(true)} title="Take a loan (10% daily interest)" aria-label="Take a loan">
                                    <Plus size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* right — profile or sign-in */}
                    <div className="nav-right">
                        {!user ? (
                            <GoogleLogin
                                onSuccess={(credentialResponse) => {
                                    if (credentialResponse.credential) {
                                        login(credentialResponse.credential).catch((err) => {
                                            console.error("Login failed:", err);
                                            alert("Sign in failed. Please try again.");
                                        });
                                    }
                                }}
                                onError={() => {
                                    console.error("Google Login Failed");
                                    alert("Google sign in failed. Please try again.");
                                }}
                                theme="filled_black"
                                shape="pill"
                            />
                        ) : (
                            <button className="nav-profile" onClick={() => router.push("/profile")} title="View profile" aria-label="View profile">
                                <img src={user.avatar} alt={user.name} />
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Promo banners */}
            {!user && (
                <div className="promo-banner promo-guest">
                    <Gift size={20} />
                    <span>Register with us & get <strong>FREE ₹100</strong> in your wallet (new users only)</span>
                </div>
            )}
            {user && !hasClaimed100Bonus && (
                <div className="promo-banner promo-claim">
                    <Gift size={20} />
                    <span>Welcome Bonus! Claim your <strong>₹100</strong> free bonus</span>
                    <button className="claim-btn" onClick={handleClaimBonus} disabled={claiming}>
                        {claiming ? "Claiming..." : "Claim ₹100"}
                    </button>
                </div>
            )}

            {/* Loan Modal */}
            {showLoanModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content modal-3d loan-modal" onClick={(e) => e.stopPropagation()}>
                        {canTakeLoan ? (
                            <>
                                {loanState === "input" && (
                                    <div className="loan2">
                                        <div className="loan2__head">
                                            <div>
                                                <span className="loan2__eyebrow">The house lends</span>
                                                <h3>Borrow from the House</h3>
                                            </div>
                                            <span className="loan2__cap">{activeLoansCount}/2 active</span>
                                        </div>
                                        <p className="loan2__sub">Credits land in your wallet instantly. <b>The house always collects</b> — 10% compound interest, every day.</p>

                                        <label className="loan2__label">Amount</label>
                                        <div className="loan2__field">
                                            <span className="loan2__cur">₹</span>
                                            <input
                                                type="number"
                                                value={loanAmount}
                                                onChange={(e) => { setLoanAmount(e.target.value); setError(""); }}
                                                placeholder="0"
                                                min="1"
                                                max="10000000"
                                                step="any"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="loan2__chips">
                                            {[500, 1000, 5000, 10000].map((v) => (
                                                <button key={v} type="button" className="loan2__chip" onClick={() => { setLoanAmount(String(v)); setError(""); }}>₹{v.toLocaleString("en-IN")}</button>
                                            ))}
                                        </div>

                                        {(parseFloat(loanAmount) || 0) > 0 && (
                                            <div className="loan2__preview">
                                                <div><span>You receive</span><b>₹{(parseFloat(loanAmount) || 0).toLocaleString("en-IN")}</b></div>
                                                <div><span>Repay in 1 day</span><b>₹{Math.round((parseFloat(loanAmount) || 0) * 1.1).toLocaleString("en-IN")}</b></div>
                                            </div>
                                        )}

                                        <p className="loan2__note"><AlertTriangle size={14} /> Interest compounds daily and lowers your leaderboard net worth until repaid.</p>

                                        {error && <p className="modal-error">{error}</p>}
                                        <div className="modal-buttons">
                                            <button className="modal-cancel" onClick={handleCloseModal}>Cancel</button>
                                            <button className="modal-confirm loan-confirm" onClick={handleTakeLoan} disabled={loading}>Borrow</button>
                                        </div>
                                    </div>
                                )}
                                {loanState === "processing" && (
                                    <div className="loan-processing">
                                        <div className="processing-spinner"></div>
                                        <h3>Processing...</h3>
                                        <p>Lending ₹{loanedAmount.toFixed(2)}</p>
                                    </div>
                                )}
                                {loanState === "success" && (
                                    <div className="loan-success">
                                        <div className="success-icon"><CheckCircle2 size={44} /></div>
                                        <h3>Loan added</h3>
                                        <p className="success-amount">₹{loanedAmount.toFixed(2)} added to wallet</p>
                                        <p className="success-hint">Repay anytime from your profile</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="loan-limit-reached">
                                    <Ban size={48} className="limit-icon" />
                                    <h3>Loan Limit Reached</h3>
                                    <p>You already have <strong>2 active loans</strong>.</p>
                                    <p className="limit-hint">Repay an existing loan to take another.</p>
                                </div>
                                <div className="modal-buttons">
                                    <button className="modal-cancel" onClick={handleCloseModal}>Close</button>
                                    <button className="modal-confirm" onClick={() => { handleCloseModal(); router.push("/profile"); }}>Go to Profile</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
