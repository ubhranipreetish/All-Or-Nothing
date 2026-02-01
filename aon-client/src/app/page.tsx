"use client";

import { useRouter } from "next/navigation";
import "../styles/Home.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import CoinAnimation from "../components/CoinAnimation";

import {
  Bomb,
  Castle,
  CircleDot,
  Shield,
  Target,
  Zap,
  Coins,
  Wallet,
  Gem,
  Trophy,
  Lock,
  BarChart3,
  Search,
  FlaskConical,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  const router = useRouter();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="home-container">
      <Navbar />

      {/* ==================== HERO SECTION ==================== */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              <span className="hero-title-gold">ALL</span> OR{" "}
              <span className="hero-title-gold">NOTHING</span>
            </h1>
            <p className="hero-tagline">Every move decides your fate.</p>
            <p className="hero-description">
              High-risk, fast-paced games built for bold decisions.
              <br />
              Play with virtual currency. No limits. No regrets.
            </p>
            <div className="hero-buttons">
              <button
                className="btn-primary btn-3d"
                onClick={() => scrollToSection("games")}
              >
                Play Now
                <ArrowRight size={20} />
              </button>
              <button
                className="btn-outline"
                onClick={() => scrollToSection("games")}
              >
                View Games
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <CoinAnimation />
          </div>
        </div>
        <div className="hero-scroll-indicator" onClick={() => scrollToSection("games")}>
          <span>Scroll to explore</span>
          <ChevronDown size={24} className="scroll-arrow-icon" />
        </div>
      </section>

      {/* ==================== FEATURED GAMES ==================== */}
      <section className="games-section" id="games">
        <div className="section-container">
          <h2 className="section-title">Choose Your Game</h2>
          <p className="section-subtitle">
            Three games. Three ways to risk it all.
          </p>

          <div className="games-grid">
            {/* Mines */}
            <div className="game-card game-card-3d" onClick={() => router.push("/mines")}>
              <div className="game-card-image">
                <img src="/images/Mines2.jpeg" alt="Mines" />
                <div className="game-card-overlay"></div>
              </div>
              <div className="game-card-content">
                <div className="game-card-icon">
                  <Bomb size={36} />
                </div>
                <h3 className="game-card-title">Mines</h3>
                <p className="game-card-description">
                  Test your luck tile by tile. One wrong move ends it all.
                </p>
                <div className="game-card-risk">
                  <span className="risk-label">Risk Level:</span>
                  <div className="risk-bars">
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                  </div>
                </div>
                <button className="game-card-btn">
                  Play Mines
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Dragon Tower */}
            <div className="game-card game-card-3d" onClick={() => router.push("/dragon-tower")}>
              <div className="game-card-image">
                <img src="/images/D_Tower2.webp" alt="Dragon Tower" />
                <div className="game-card-overlay"></div>
              </div>
              <div className="game-card-content">
                <div className="game-card-icon">
                  <Castle size={36} />
                </div>
                <h3 className="game-card-title">Dragon Tower</h3>
                <p className="game-card-description">
                  Climb higher for bigger rewards — or lose everything.
                </p>
                <div className="game-card-risk">
                  <span className="risk-label">Risk Level:</span>
                  <div className="risk-bars">
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar"></span>
                  </div>
                </div>
                <button className="game-card-btn">
                  Play Dragon Tower
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Wheel of Fortune */}
            <div className="game-card game-card-3d" onClick={() => router.push("/wheel")}>
              <div className="game-card-image">
                <img src="/images/wheel.jpg" alt="Wheel of Fortune" />
                <div className="game-card-overlay"></div>
              </div>
              <div className="game-card-content">
                <div className="game-card-icon">
                  <CircleDot size={36} />
                </div>
                <h3 className="game-card-title">Wheel of Fortune</h3>
                <p className="game-card-description">
                  One spin. One outcome. All or nothing.
                </p>
                <div className="game-card-risk">
                  <span className="risk-label">Risk Level:</span>
                  <div className="risk-bars">
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar"></span>
                    <span className="risk-bar"></span>
                  </div>
                </div>
                <button className="game-card-btn">
                  Spin the Wheel
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>

            {/* Roulette */}
            {/* <div className="game-card game-card-3d" onClick={() => router.push("/roulette")}>
              <div className="game-card-image">
                <img src="/images/wheel.jpg" alt="Roulette" />
                <div className="game-card-overlay"></div>
              </div>
              <div className="game-card-content">
                <div className="game-card-icon">
                  <Target size={36} />
                </div>
                <h3 className="game-card-title">Roulette</h3>
                <p className="game-card-description">
                  Place your bets. Spin the wheel. Win big.
                </p>
                <div className="game-card-risk">
                  <span className="risk-label">Risk Level:</span>
                  <div className="risk-bars">
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar active"></span>
                    <span className="risk-bar"></span>
                  </div>
                </div>
                <button className="game-card-btn">
                  Play Roulette
                  <ArrowRight size={18} />
                </button>
              </div>
            </div> */}
          </div>
        </div>
      </section>

      {/* ==================== WHY ALL OR NOTHING ==================== */}
      <section className="why-section">
        <div className="section-container">
          <h2 className="section-title">Why All Or Nothing?</h2>
          <p className="section-subtitle">Built different. Built for bold.</p>

          <div className="why-grid">
            <div className="why-card why-card-3d">
              <div className="why-icon">
                <Zap size={40} />
              </div>
              <h3>High Stakes Gameplay</h3>
              <p>No slow grinding. Every round matters. Every decision counts.</p>
            </div>
            <div className="why-card why-card-3d">
              <div className="why-icon">
                <Wallet size={40} />
              </div>
              <h3>Unified Wallet</h3>
              <p>One wallet. All games. Seamless flow between games.</p>
            </div>
            <div className="why-card why-card-3d">
              <div className="why-icon">
                <Trophy size={40} />
              </div>
              <h3>Built for Risk Takers</h3>
              <p>Designed for players who play bold and live for the thrill.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="how-section" id="how-it-works">
        <div className="section-container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Four steps to glory (or defeat).</p>

          <div className="steps-grid">
            <div className="step-card step-card-3d">
              <div className="step-number">1</div>
              <div className="step-icon">
                <Coins size={28} />
              </div>
              <h3>Add Balance</h3>
              <p>Load up your virtual wallet with play money.</p>
            </div>
            <div className="step-card step-card-3d">
              <div className="step-number">2</div>
              <div className="step-icon">
                <Gem size={28} />
              </div>
              <h3>Choose Game</h3>
              <p>Pick your battlefield: Mines, Dragon Tower, or Wheel.</p>
            </div>
            <div className="step-card step-card-3d">
              <div className="step-number">3</div>
              <div className="step-icon">
                <Target size={28} />
              </div>
              <h3>Place Bet</h3>
              <p>Set your stake. Higher risk = higher reward.</p>
            </div>
            <div className="step-card step-card-3d">
              <div className="step-number">4</div>
              <div className="step-icon">
                <Trophy size={28} />
              </div>
              <h3>Play & Cash Out</h3>
              <p>Win big or lose it all. The choice is yours.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== TRUST & TRANSPARENCY SECTION ==================== */}
      <section className="fairness-section" id="fairness">
        <div className="section-container">
          <h2 className="section-title">Trust & Transparency</h2>
          <p className="section-subtitle">
            Your trust is our foundation.
          </p>

          <div className="fairness-grid">
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <Lock size={32} />
              </div>
              <h4>Secure Wallet System</h4>
              <p>Your virtual balance is protected with robust security measures.</p>
            </div>
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <Zap size={32} />
              </div>
              <h4>Instant Results</h4>
              <p>No waiting. Outcomes are calculated and displayed immediately.</p>
            </div>
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <Shield size={32} />
              </div>
              <h4>Fair Random Generation</h4>
              <p>Cryptographically secure randomness for all game outcomes.</p>
            </div>
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <BarChart3 size={32} />
              </div>
              <h4>Transparent Multipliers</h4>
              <p>All odds and multipliers are visible before you play.</p>
            </div>
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <Search size={32} />
              </div>
              <h4>No Manipulation</h4>
              <p>Outcomes cannot be altered or biased in any way.</p>
            </div>
            <div className="fairness-item fairness-item-3d">
              <div className="fairness-icon">
                <FlaskConical size={32} />
              </div>
              <h4>Simulation Based</h4>
              <p>Pure mathematical simulation with no external factors.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="cta-section">
        <div className="cta-content">
          <h2 className="cta-title">Are you ready to risk it all?</h2>
          <p className="cta-subtitle">
            Fortune favors the bold. Make your move.
          </p>
          <div className="cta-buttons">
            <button
              className="btn-primary btn-large btn-3d"
              onClick={() => scrollToSection("games")}
            >
              Play Now
              <ArrowRight size={22} />
            </button>
            <button
              className="btn-outline btn-large"
              onClick={() => scrollToSection("games")}
            >
              View Games
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
