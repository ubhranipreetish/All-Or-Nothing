"use client";

import Link from "next/link";
import "../styles/Footer.css";

const GAMES = [
    { name: "Mines", href: "/mines" },
    { name: "Dragon Tower", href: "/dragon-tower" },
    { name: "Fortune Wheel", href: "/wheel" },
    { name: "Roulette", href: "/roulette" },
    { name: "Poker", href: "/poker" },
];

export default function Footer() {
    return (
        <footer className="ft">
            <div className="ft__top">
                <div className="ft__brand">
                    <Link href="/" className="ft__logo">
                        <img src="/images/aon-logo.png" alt="All Or Nothing" />
                    </Link>
                    <p className="ft__blurb">
                        Five games of nerve, one wallet of play-money credits. Chase the
                        leaderboard — not your losses.
                    </p>
                    <span className="ft__badge">Play-money only · no real money</span>
                </div>

                <nav className="ft__cols" aria-label="Footer">
                    <div className="ft__col">
                        <h4 className="ft__h">Games</h4>
                        {GAMES.map((g) => (
                            <Link key={g.href} href={g.href}>{g.name}</Link>
                        ))}
                    </div>
                    <div className="ft__col">
                        <h4 className="ft__h">Account</h4>
                        <Link href="/leaderboard">Leaderboard</Link>
                        <Link href="/profile">My Profile</Link>
                        <Link href="/#fairness">Provably Fair</Link>
                    </div>
                </nav>
            </div>

            <div className="ft__bar">
                <span className="ft__mark">ALL <em>or</em> NOTHING</span>
                <span className="ft__legal">© 2026 · For entertainment only · Play responsibly · 18+</span>
            </div>
        </footer>
    );
}
