"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import { GoogleLogin } from "@react-oauth/google";
import { Wallet, Plus, Menu, X, Gamepad2, HelpCircle, Shield, Gift, AlertTriangle, Ban } from "lucide-react";
import "../styles/Navbar.css";

export default function Navbar() {
    const { wallet, loading, hasClaimed100Bonus, claimWelcomeBonus, activeLoansCount, canTakeLoan, takeLoan } = useWallet();
    const { user, login } = useAuth();
    const router = useRouter();
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [loanAmount, setLoanAmount] = useState("");
    const [error, setError] = useState("");
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [loanState, setLoanState] = useState<"input" | "processing" | "success">("input");
    const [loanedAmount, setLoanedAmount] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const hash = window.location.hash;
        if (hash) {
            setTimeout(() => {
                const targetId = hash.replace('#', '');
                const element = document.getElementById(targetId);
                if (element) {
                    const offset = 80;
                    const elementPosition = element.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                }
            }, 100);
        }
    }, []);

    const handleTakeLoan = async () => {
        const amount = parseFloat(loanAmount) || 0;
        if (amount <= 0) {
            setError("Please enter a valid amount greater than 0");
            return;
        }
        if (amount > 10000000) {
            setError("Maximum loan amount is ₹1,00,00,000");
            return;
        }

        // Show processing state
        setLoanState("processing");
        setLoanedAmount(amount);

        // Wait 0.5 second for visual feedback
        await new Promise(resolve => setTimeout(resolve, 500));

        const success = await takeLoan(amount);
        if (success) {
            setLoanState("success");
            setLoanAmount("");
            setError("");
            // Auto close after 1 second
            setTimeout(() => {
                handleCloseModal();
            }, 1000);
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
        if (!success) {
            alert("Failed to claim bonus. Please try again.");
        }
    };

    const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
        e.preventDefault();
        const isHomePage = window.location.pathname === "/" || window.location.pathname === "";

        if (isHomePage) {
            const element = document.getElementById(targetId);
            if (element) {
                const offset = 80;
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        } else {
            router.push(`/#${targetId}`);
        }
        setMobileMenuOpen(false);
    };

    return (
        <>
            <nav className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
                <div className="navbar-container">
                    <div className="logo" onClick={() => router.push("/")}>
                        <img src="/images/logo.png" alt="All Or Nothing" />
                    </div>

                    <div className="nav-links">
                        <a href="#games" className="nav-link" onClick={(e) => handleSmoothScroll(e, "games")}>
                            <Gamepad2 size={18} />
                            <span>Games</span>
                        </a>
                        <a href="#how-it-works" className="nav-link" onClick={(e) => handleSmoothScroll(e, "how-it-works")}>
                            <HelpCircle size={18} />
                            <span>How to Play</span>
                        </a>
                        <a href="#fairness" className="nav-link" onClick={(e) => handleSmoothScroll(e, "fairness")}>
                            <Shield size={18} />
                            <span>Fairness</span>
                        </a>
                    </div>

                    <div className="nav-right">
                        {user && (
                            <div className="wallet-section">
                                <Wallet size={18} className="wallet-icon-svg" />
                                <span className="wallet">₹{wallet.toFixed(2)}</span>
                                <button className="add-money-btn" onClick={() => setShowLoanModal(true)}>
                                    <Plus size={20} />
                                </button>
                            </div>
                        )}

                        <button className="play-now-btn" onClick={() => {
                            const element = document.getElementById("games");
                            if (element) {
                                element.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                        }}>
                            Play Now
                        </button>

                        <div className="auth-container" style={{ marginLeft: '1rem' }}>
                            {!user ? (
                                <GoogleLogin
                                    onSuccess={(credentialResponse) => {
                                        if (credentialResponse.credential) {
                                            login(credentialResponse.credential);
                                        }
                                    }}
                                    onError={() => {
                                        console.log('Login Failed');
                                    }}
                                    theme="filled_black"
                                    shape="pill"
                                />
                            ) : (
                                <div
                                    className="user-profile"
                                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                    onClick={() => router.push('/profile')}
                                    title="View Profile"
                                >
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '50%',
                                            border: '2px solid #ffd700',
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                            e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        className="mobile-menu-toggle"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className="mobile-menu">
                        <a href="#games" className="mobile-nav-link" onClick={(e) => handleSmoothScroll(e, "games")}>
                            <Gamepad2 size={20} />
                            <span>Games</span>
                        </a>
                        <a href="#how-it-works" className="mobile-nav-link" onClick={(e) => handleSmoothScroll(e, "how-it-works")}>
                            <HelpCircle size={20} />
                            <span>How to Play</span>
                        </a>
                        <a href="#fairness" className="mobile-nav-link" onClick={(e) => handleSmoothScroll(e, "fairness")}>
                            <Shield size={20} />
                            <span>Fairness</span>
                        </a>
                        {user && (
                            <div className="mobile-wallet">
                                <span>Wallet: ₹{wallet.toFixed(2)}</span>
                                <button onClick={() => { setShowLoanModal(true); setMobileMenuOpen(false); }}>Take Loan</button>
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* Promo Banner */}
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
                    <button
                        className="claim-btn"
                        onClick={handleClaimBonus}
                        disabled={claiming}
                    >
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
                                    <>
                                        <h3>💰 Take a Loan</h3>
                                        <p className="loan-subtitle">Get instant funds for your wallet</p>

                                        <div className="loan-input-section">
                                            <label>Choose Amount:</label>
                                            <input
                                                type="number"
                                                value={loanAmount}
                                                onChange={(e) => {
                                                    setLoanAmount(e.target.value);
                                                    setError("");
                                                }}
                                                placeholder="Enter loan amount"
                                                min="1"
                                                max="10000000"
                                                step="any"
                                                autoFocus
                                            />
                                        </div>

                                        <div className="loan-status">
                                            <span className="loan-count">Active Loans: <strong>{activeLoansCount} / 2</strong></span>
                                        </div>

                                        <div className="loan-warnings">
                                            <div className="warning-item">
                                                <AlertTriangle size={16} />
                                                <span>10% daily compound interest applies</span>
                                            </div>
                                            <div className="warning-item">
                                                <AlertTriangle size={16} />
                                                <span>Loan deducted from leaderboard instantly</span>
                                            </div>
                                        </div>

                                        {error && <p className="modal-error">{error}</p>}

                                        <div className="modal-buttons">
                                            <button className="modal-cancel" onClick={handleCloseModal}>
                                                Cancel
                                            </button>
                                            <button
                                                className="modal-confirm loan-confirm"
                                                onClick={handleTakeLoan}
                                                disabled={loading}
                                            >
                                                Confirm Loan
                                            </button>
                                        </div>
                                    </>
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
                                        <div className="success-icon">✅</div>
                                        <h3>Money Lended!</h3>
                                        <p className="success-amount">₹{loanedAmount.toFixed(2)} added to wallet</p>
                                        <p className="success-hint">Repay with 10% daily interest</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="loan-limit-reached">
                                    <Ban size={48} className="limit-icon" />
                                    <h3>🚫 Loan Limit Reached</h3>
                                    <p>You already have <strong>2 active loans</strong>.</p>
                                    <p className="limit-hint">Repay an existing loan to take another.</p>
                                </div>
                                <div className="modal-buttons">
                                    <button className="modal-cancel" onClick={handleCloseModal}>
                                        Close
                                    </button>
                                    <button
                                        className="modal-confirm"
                                        onClick={() => { handleCloseModal(); router.push('/profile'); }}
                                    >
                                        Go to Profile
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
