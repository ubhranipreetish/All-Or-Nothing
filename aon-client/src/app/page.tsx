"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from "framer-motion";
import { ArrowUpRight, ArrowRight, Bomb, Flame, Disc3, Target, Spade } from "lucide-react";
import "../styles/Landing.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { useWallet } from "../contexts/WalletContext";
import ComebackStory from "../components/landing/ComebackStory";
import ScrollStoryVideo from "../components/landing/ScrollStoryVideo";
import TiltCard from "../components/landing/TiltCard";
import CountUp from "../components/landing/CountUp";

/* ------------------------------------------------------------------ data */

const GAMES = [
  {
    id: "mines",
    index: "01",
    name: "MINES",
    tag: "Uncover gems. One bomb ends it all.",
    desc: "Flip tiles to grow your multiplier. The more you reveal, the more you risk. Cash out before greed detonates the board.",
    risk: 72,
    img: "/images/mines_c.png",
    href: "/mines",
    accent: "gold",
  },
  {
    id: "dragon",
    index: "02",
    name: "DRAGON TOWER",
    tag: "Climb. Don't wake the dragon.",
    desc: "Pick a safe step on every floor and watch the multiplier soar. Choose the dragon's tile and the tower burns beneath you.",
    risk: 86,
    img: "/images/dragon_c.png",
    href: "/dragon-tower",
    accent: "ember",
  },
  {
    id: "wheel",
    index: "03",
    name: "FORTUNE WHEEL",
    tag: "One spin decides everything.",
    desc: "Set your risk, send it flying, and live with where the pointer lands. No second chances — pure, electric fate.",
    risk: 64,
    img: "/images/wheel_c.png",
    href: "/wheel",
    accent: "violet",
  },
  {
    id: "roulette",
    index: "04",
    name: "ROULETTE",
    tag: "Drop the ball. Read your fate.",
    desc: "European single-zero. Stack chips across the felt — straights, splits, dozens, colors — then watch the ball decide it all.",
    risk: 70,
    img: "/images/roulette_c.png",
    href: "/roulette",
    accent: "ember",
  },
  {
    id: "poker",
    index: "05",
    name: "POKER",
    tag: "Read them. Bluff them. Take it all.",
    desc: "No-limit Texas Hold'em for up to 6. Create a private room, share the code, and play with credits against your friends in real time.",
    risk: 90,
    img: "/images/poker_c.png",
    href: "/poker",
    accent: "violet",
  },
];

/* ------------------------------------------------------- small components */

function Reveal({
  children,
  className = "",
  delay = 0,
  y = 36,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12%" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function RiskMeter({ value, accent }: { value: number; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  return (
    <div className="fe-risk" ref={ref} data-accent={accent}>
      <div className="fe-risk__head">
        <span>RISK</span>
        <span>{value}%</span>
      </div>
      <div className="fe-risk__track">
        <motion.div
          className="fe-risk__fill"
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: value / 100 } : {}}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasClaimed100Bonus } = useWallet();
  // Once the bonus is claimed, drop the "Claim ₹100" pitch from the bottom CTA.
  const bonusAvailable = !user || !hasClaimed100Bonus;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  // page-wide scroll progress (top bar)
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  // hero parallax
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroP } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroTitleY = useTransform(heroP, [0, 1], [0, -120]);
  const heroFade = useTransform(heroP, [0, 0.7], [1, 0]);

  return (
    <div className="fe">
      <motion.div className="fe-progress" style={{ scaleX: bar }} />

      <Navbar />

      {/* ============================ HERO ============================ */}
      <section className="fe-hero" ref={heroRef} id="top">
        <div className="fe-hero__bg" aria-hidden>
          <div className="fe-hero__halo" />
          <div className="fe-hero__grid" />
        </div>

        <motion.div className="fe-hero__inner" style={{ y: heroTitleY, opacity: heroFade }}>
          <h1 className="fe-hero__title">
            <span className="fe-line">
              <span className="fe-stroke">ALL</span>
            </span>
            <span className="fe-line fe-line--or">
              <em>or</em>
            </span>
            <span className="fe-line">
              <span className="fe-fill">NOTHING</span>
            </span>
          </h1>

          <p className="fe-hero__sub">
            Five games. One rule — <em>every move decides your fate.</em> Play with
            virtual credits, chase the leaderboard, risk it to the last tile.
          </p>

          <div className="fe-hero__cta">
            <button className="fe-btn fe-btn--gold" onClick={() => scrollTo("games")} data-cursor>
              Enter the arena <ArrowRight size={18} />
            </button>
            <button className="fe-btn fe-btn--ghost" onClick={() => scrollTo("fairness")} data-cursor>
              Why it's fair
            </button>
          </div>
        </motion.div>

        {/* right side — 3D spinning disc (temporarily disabled — perf)
        <motion.div className="fe-hero__disc" aria-hidden style={{ opacity: heroFade }}>
          <div className="fe-hero__disc-glow" />
          <motion.div className="fe-hero__disc-stage" style={{ rotateX: discRX, rotateY: discRY }}>
            <div className="fe-hero__disc-edge" />
            <div className="fe-hero__disc-spin" />
            <div className="fe-hero__disc-sheen" />
          </motion.div>
        </motion.div>
        */}
      </section>

      {/* marquee ticker */}
      <div className="fe-marquee" aria-hidden>
        <div className="fe-marquee__track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              MINES <i>✦</i> DRAGON TOWER <i>✦</i> FORTUNE WHEEL <i>✦</i> PROVABLY FAIR{" "}
              <i>✦</i> NO REAL MONEY <i>✦</i> ALL OR NOTHING <i>✦</i>{" "}
            </span>
          ))}
        </div>
      </div>

      {/* ============ SCROLL STORY — scroll-scrubbed golden-coin video ============ */}
      <ScrollStoryVideo />

      {/* =========================== GAMES =========================== */}
      <section className="fe-games" id="games">
        <Reveal className="fe-section-head">
          <h2 className="fe-h2">
            Pick your <em>fate</em>.
          </h2>
        </Reveal>

        <div className="fe-games__list">
          {GAMES.map((g, i) => (
            <Reveal key={g.id} className={`fe-game ${i % 2 ? "fe-game--rev" : ""}`} y={60}>
              <div className="fe-game__media" data-accent={g.accent}>
                <TiltCard className="fe-game__card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.img} alt={g.name} className="fe-game__img" />
                  <div className="fe-game__wash" />
                  <div className="fe-game__holo" />
                  <div className="fe-game__emblem">
                    {g.id === "mines" && <Bomb size={26} />}
                    {g.id === "dragon" && <Flame size={26} />}
                    {g.id === "wheel" && <Disc3 size={26} />}
                    {g.id === "roulette" && <Target size={26} />}
                    {g.id === "poker" && <Spade size={26} />}
                  </div>
                  <div className="fe-game__plate">
                    <span className="fe-game__plate-k">{g.index}</span>
                    <span className="fe-game__plate-name">{g.name}</span>
                  </div>
                </TiltCard>
              </div>

              <div className="fe-game__body">
                <span className="fe-game__no">{g.index}</span>
                <h3 className="fe-game__name">{g.name}</h3>
                <p className="fe-game__tag">{g.tag}</p>
                <p className="fe-game__desc">{g.desc}</p>
                <RiskMeter value={g.risk} accent={g.accent} />
                <button className="fe-btn fe-btn--gold" onClick={() => router.push(g.href)} data-cursor>
                  Play {g.name} <ArrowUpRight size={18} />
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== QUOTE INTERLUDE (between-section breather) ===================== */}
      <section className="fe-interlude">
        <Reveal>
          <p className="fe-interlude__q">
            Every legend started with a <em>single bet.</em>
          </p>
        </Reveal>
      </section>

      {/* =========================== STATS =========================== */}
      <section className="fe-stats" id="fairness">
        <div className="fe-stats__grid">
          <Reveal className="fe-stat">
            <div className="fe-stat__num">
              <CountUp to={100} suffix="%" />
            </div>
            <div className="fe-stat__label">Provably fair</div>
          </Reveal>
          <Reveal className="fe-stat" delay={0.08}>
            <div className="fe-stat__num">
              <CountUp to={0} prefix="₹" />
            </div>
            <div className="fe-stat__label">Real money at risk</div>
          </Reveal>
          <Reveal className="fe-stat" delay={0.16}>
            <div className="fe-stat__num">
              <CountUp to={5} />
            </div>
            <div className="fe-stat__label">High-stakes games</div>
          </Reveal>
          <Reveal className="fe-stat" delay={0.24}>
            <div className="fe-stat__num fe-stat__num--serif">
              <em>live</em>
            </div>
            <div className="fe-stat__label">Global leaderboard</div>
          </Reveal>
        </div>
      </section>

      {/* ===================== QUOTE INTERLUDE ===================== */}
      <section className="fe-interlude">
        <Reveal>
          <p className="fe-interlude__q">
            Scared money <em>never wins.</em>
          </p>
        </Reveal>
      </section>

      {/* ============ SCROLL STORY — "The Comeback" (streak → bust → loan → 100× → star) ============ */}
      <ComebackStory />

      {/* ===================== QUOTE INTERLUDE ===================== */}
      <section className="fe-interlude">
        <Reveal>
          <p className="fe-interlude__q">
            You're one bet away from your <em>biggest win.</em>
          </p>
        </Reveal>
      </section>

      {/* ========================== FINAL CTA ========================== */}
      <section className="fe-final">
        <div className="fe-final__halo" aria-hidden />
        <Reveal className="fe-final__inner">
          <h2 className="fe-final__title">
            ALL <em>or</em> NOTHING
          </h2>
          <p className="fe-final__sub">
            {bonusAvailable
              ? "Claim your ₹100, pick a game, and find out which side of the coin you're on."
              : "Pick a game and find out which side of the coin you're on."}
          </p>
          <button className="fe-btn fe-btn--gold fe-btn--lg" onClick={() => scrollTo("games")} data-cursor>
            {bonusAvailable ? "Claim ₹100 & play" : "Enter the arena"} <ArrowRight size={20} />
          </button>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
