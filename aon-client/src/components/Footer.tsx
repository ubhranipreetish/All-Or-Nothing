"use client";

import Link from "next/link";
import { Bomb, Castle, CircleDot } from "lucide-react";
import "../styles/Footer.css";

export default function Footer() {
    return (
        <footer className="footer">
            <div className="footer-content">
                {/* Logo & Info */}
                <div className="footer-main">
                    <div className="footer-logo">
                        <img src="/images/logo.png" alt="All Or Nothing" />
                    </div>
                    <p className="footer-tagline">
                        High-risk, high-reward gaming for the bold. Virtual currency only — no real money involved.
                    </p>
                </div>

                {/* Links */}
                <div className="footer-nav">
                    <div className="footer-nav-group">
                        <h4>Games</h4>
                        <Link href="/mines">
                            <Bomb size={16} />
                            Mines
                        </Link>
                        <Link href="/dragon-tower">
                            <Castle size={16} />
                            Dragon Tower
                        </Link>
                        <Link href="/wheel">
                            <CircleDot size={16} />
                            Wheel of Fortune
                        </Link>
                    </div>
                    <div className="footer-nav-group">
                        <h4>Info</h4>
                        <Link href="/#how-it-works">How to Play</Link>
                        <Link href="/#fairness">Trust & Transparency</Link>
                    </div>
                </div>
            </div>

            {/* Bottom */}
            <div className="footer-bottom">
                <p>&copy; 2025 All Or Nothing. For entertainment purposes only. Play responsibly.</p>
            </div>
        </footer>
    );
}
