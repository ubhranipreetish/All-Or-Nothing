"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "../contexts/WalletContext";
import { useAuth } from "../contexts/AuthContext";
import { GoogleLogin } from "@react-oauth/google";
import { Wallet, Plus, Menu, X, Gamepad2, HelpCircle, Shield, Gift } from "lucide-react";
import "../styles/Navbar.css";

export default function Navbar() {
    const { wallet, addMoney, loading, hasClaimed100Bonus, claimWelcomeBonus } = useWallet();
    const { user, login, logout } = useAuth();
    const router = useRouter();
    const [showAddModal, setShowAddModal] = useState(false);
    const [addAmount, setAddAmount] = useState("");
    const [error, setError] = useState("");
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [claiming, setClaiming] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Handle hash-based scrolling when navigating from other pages
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

    const handleAddMoney = async () => {
        const amount = parseFloat(addAmount) || 0;
        if (amount <= 0) {
            setError("Please enter a valid amount greater than 0");
            return;
        }
        if (amount > 10000000) {
            setError("Maximum amount is ₹1,00,00,000 (1 Crore)");
            return;
        }
        const success = await addMoney(amount);
        if (success) {
            setShowAddModal(false);
            setAddAmount("");
            setError("");
        } else {
            setError("Failed to add money");
        }
    };

    const handleCloseModal = () => {
        setShowAddModal(false);
        setAddAmount("");
        setError("");
    };

    const handleClaimBonus = async () => {
        setClaiming(true);
        const success = await claimWelcomeBonus();
        setClaiming(false);
        if (!success) {
            alert("Failed to claim bonus. Please try again.");
        }
    };

    // Smooth scroll handler
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

                    {/* Desktop Nav Links */}
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
                        {/* Wallet - Only show when logged in */}
                        {user && (
                            <div className="wallet-section">
                                <Wallet size={18} className="wallet-icon-svg" />
                                <span className="wallet">₹{wallet.toFixed(2)}</span>
                                <button className="add-money-btn" onClick={() => setShowAddModal(true)}>
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

                    {/* Mobile Menu Toggle */}
                    <button
                        className="mobile-menu-toggle"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Mobile Menu */}
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
                                <button onClick={() => { setShowAddModal(true); setMobileMenuOpen(false); }}>Add Money</button>
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
                    <span>🎉 Welcome Bonus! Claim your <strong>₹100</strong> free bonus</span>
                    <button
                        className="claim-btn"
                        onClick={handleClaimBonus}
                        disabled={claiming}
                    >
                        {claiming ? "Claiming..." : "Claim ₹100"}
                    </button>
                </div>
            )}

            {/* Add Money Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content modal-3d" onClick={(e) => e.stopPropagation()}>
                        <h3>Add Virtual Currency</h3>
                        <input
                            type="number"
                            value={addAmount}
                            onChange={(e) => {
                                setAddAmount(e.target.value);
                                setError("");
                            }}
                            placeholder="Enter amount"
                            min="1"
                            max="10000000"
                            step="any"
                            autoFocus
                        />
                        {error && <p className="modal-error">{error}</p>}
                        <div className="modal-buttons">
                            <button className="modal-cancel" onClick={handleCloseModal}>
                                Cancel
                            </button>
                            <button className="modal-confirm" onClick={handleAddMoney}>
                                Add ₹{addAmount || 0}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
