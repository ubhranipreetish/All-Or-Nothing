"use client";

import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent, type MotionValue } from "framer-motion";

/* OPTION D (refined) — THE COMEBACK. A winnings streak climbs, craters to 0×
   (the bust), a loan throws a lifeline, then it's run all the way to 100× before
   the particles ignite into the original five-point star. */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* story phase boundaries, in reveal-progress (0..1 across the climb) */
const P1 = 0.28; // top of the first win
const P2 = 0.42; // bottom of the crash
const P3 = 0.52; // end of the broke stretch
const P4 = 0.6; // top of the loan lifeline
const REVEAL_END = 0.85; // chart fully drawn; star morph runs 0.85→1

/* six-beat story — Option D keeps its own copy so the longer arc is complete */
const BEATS = [
  { r: [0.0, 0.16], k: "01", t: "Ride the streak.", s: "Every safe call compounds. The line climbs, the multiplier swells, the board takes notice." },
  { r: [0.18, 0.34], k: "02", t: "Then it turns.", s: "One greedy tile too far. The streak snaps and the multiplier craters." },
  { r: [0.36, 0.48], k: "03", t: "Down to nothing.", s: "Zero. Wiped clean — the comedown every gambler knows by heart." },
  { r: [0.5, 0.64], k: "04", t: "Take the loan.", s: "A lifeline on the house. Borrow against tomorrow and load one more shot." },
  { r: [0.66, 0.82], k: "05", t: "Run it all the way back.", s: "Mines, tower, wheel — compound it past 100×. This is the comeback they'll talk about." },
  { r: [0.85, 1.0], k: "06", t: "Carve your legend.", s: "Cash out a legend. The leaderboard remembers the ones who came back from zero." },
] as const;

function Beat({ progress, beat }: { progress: MotionValue<number>; beat: (typeof BEATS)[number] }) {
  const [a, b] = beat.r;
  const pad = 0.04;
  const lo = Math.max(0, a - pad);
  const hi = Math.min(1, b + pad);
  const opacity = useTransform(progress, [lo, a + 0.02, b - 0.02, hi], [0, 1, 1, 0]);
  const y = useTransform(progress, [lo, a + 0.04], [26, 0]);
  return (
    <motion.div className="fe-story__beat" style={{ opacity, y }}>
      <h3 className="fe-story__t">{beat.t}</h3>
      <p className="fe-story__s">{beat.s}</p>
    </motion.div>
  );
}

type P = { u: number; jit: number; sx: number; sy: number; size: number; tw: number; sprite: HTMLCanvasElement };

function makeSprite(color: string, r = 16) {
  const c = document.createElement("canvas");
  c.width = c.height = r * 2;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

/* normalised chart height (0 = floor, 1 = ceiling) along the story */
function heightFrac(p: number) {
  if (p < P1) return lerp(0.12, 0.52, easeOut(p / P1));
  if (p < P2) return lerp(0.52, 0.0, easeIn((p - P1) / (P2 - P1))); // crash
  if (p < P3) return lerp(0.0, 0.015, (p - P2) / (P3 - P2)); // broke
  if (p < P4) return lerp(0.015, 0.22, easeOut((p - P3) / (P4 - P3))); // loan lifts
  return lerp(0.22, 1.0, easeIn((p - P4) / (1 - P4))); // comeback
}

/* the multiplier number shown along the story */
function multAt(p: number) {
  if (p < P1) return lerp(1, 14, easeOut(p / P1));
  if (p < P2) return lerp(14, 0, easeIn((p - P1) / (P2 - P1)));
  if (p < P4) return 0;
  return lerp(1, 100, easeIn((p - P4) / (1 - P4)));
}

/* mood colour by story phase */
function mood(p: number): [number, number, number] {
  if (p < P1) return [255, 216, 119]; // gold — winning
  if (p < P3) return [255, 84, 64]; // ember — crash & broke
  if (p < P4) return [78, 222, 170]; // jade — the loan / hope
  return [255, 216, 119]; // gold — comeback
}

export default function ComebackStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  useMotionValueEvent(scrollYProgress, "change", (v) => (progRef.current = v));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const N = isMobile ? 360 : 660;

    const sprites = [
      makeSprite("rgba(255,216,119,1)"),
      makeSprite("rgba(233,185,73,1)"),
      makeSprite("rgba(167,139,250,1)"),
      makeSprite("rgba(255,236,200,1)"),
    ];

    let w = 0, h = 0, dpr = 1, raf = 0, running = false, disp = 0, time = 0;
    let x0 = 0, xN = 0, baseY = 0, chartH = 0;

    const particles: P[] = Array.from({ length: N }, (_, i) => ({
      u: i / N,
      jit: (Math.random() - 0.5) * 2,
      sx: 0, sy: 0,
      size: 1.2 + Math.random() * 2.4,
      tw: Math.random() * Math.PI * 2,
      sprite: sprites[i % 7 === 0 ? 2 : i % 11 === 0 ? 3 : i % 2],
    }));

    const buildStar = () => {
      const cx = w / 2, cy = h * 0.4;
      const outer = Math.min(w, h) * 0.24;
      const inner = outer * 0.42;
      const verts: [number, number][] = [];
      for (let kk = 0; kk < 10; kk++) {
        const ang = -Math.PI / 2 + (kk * Math.PI) / 5;
        const rad = kk % 2 === 0 ? outer : inner;
        verts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
      }
      const edges = verts.map((v, k) => {
        const n = verts[(k + 1) % 10];
        return Math.hypot(n[0] - v[0], n[1] - v[1]);
      });
      const perim = edges.reduce((a, b) => a + b, 0);
      particles.forEach((p, i) => {
        const d = (i / N) * perim;
        let acc = 0, k = 0;
        while (k < 9 && acc + edges[k] < d) { acc += edges[k]; k++; }
        const segT = edges[k] > 0 ? (d - acc) / edges[k] : 0;
        p.sx = lerp(verts[k][0], verts[(k + 1) % 10][0], segT) + p.jit * 3;
        p.sy = lerp(verts[k][1], verts[(k + 1) % 10][1], segT) + p.jit * 3;
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Chart sits in the upper-middle band: its floor (the 0× dip) stays well
      // above the bottom captions, and its ceiling (the 100× peak) stays below
      // the multiplier readout. The multiplier number position is unchanged.
      x0 = w * 0.1; xN = w * 0.9; baseY = h * 0.62; chartH = h * 0.27;
      buildStar();
    };

    const chartAt = (u: number): [number, number] => {
      const x = lerp(x0, xN, clamp01(u));
      const y = baseY - heightFrac(clamp01(u)) * chartH;
      return [x, y];
    };

    const render = () => {
      disp += (progRef.current - disp) * 0.12;
      const t = disp;
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      const head = clamp01(t / REVEAL_END);
      const morph = clamp01((t - REVEAL_END) / (1 - REVEAL_END));
      const mk = easeInOut(morph);
      const [mr, mg, mb] = mood(head);

      // background glow — rises with the story, ignites into the star climax
      const cx = w / 2, cy = h * 0.4;
      const glowY = morph > 0 ? cy : lerp(h * 0.62, cy, head);
      const coreR = Math.min(w, h) * (0.22 + morph * 0.34);
      const g = ctx.createRadialGradient(cx, glowY, 0, cx, glowY, coreR);
      g.addColorStop(0, `rgba(${mr},${mg},${mb},${0.1 + morph * 0.45})`);
      g.addColorStop(0.5, `rgba(167,139,250,${0.03 + morph * 0.12})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // the streak line (fades as the particles peel off into the star)
      if (morph < 1) {
        const grad = ctx.createLinearGradient(x0, 0, xN, 0);
        const gold = "255,216,119", ember = "255,84,64", jade = "78,222,170";
        grad.addColorStop(0, `rgba(${gold},0.85)`);
        grad.addColorStop(Math.max(0.001, P1 - 0.01), `rgba(${gold},0.85)`);
        grad.addColorStop(P1 + 0.02, `rgba(${ember},0.85)`);
        grad.addColorStop(P3, `rgba(${ember},0.85)`);
        grad.addColorStop(P3 + 0.02, `rgba(${jade},0.85)`);
        grad.addColorStop(P4, `rgba(${jade},0.85)`);
        grad.addColorStop(Math.min(0.999, P4 + 0.03), `rgba(${gold},0.9)`);
        grad.addColorStop(1, `rgba(${gold},1)`);

        ctx.beginPath();
        const SAMP = 200;
        const endS = Math.floor(head * SAMP);
        ctx.moveTo(...chartAt(0));
        for (let s = 1; s <= endS; s++) ctx.lineTo(...chartAt(s / SAMP));
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 1 - morph;
        ctx.shadowColor = `rgba(${mr},${mg},${mb},0.7)`;
        ctx.shadowBlur = 18 * (1 - morph);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // head marker
        const [hx, hy] = chartAt(head);
        ctx.fillStyle = `rgba(${mr},${mg},${mb},${1 - morph})`;
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // particles ride the revealed streak, then fly up into the star
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        const onPath = p.u <= head;
        if (!onPath && morph === 0) continue;
        const [px, py] = chartAt(p.u);
        const bx = px + p.jit * 5;
        const by = py + p.jit * 5;
        const x = lerp(bx, p.sx, mk);
        const y = lerp(by, p.sy, mk);
        const tw = 0.65 + 0.35 * Math.sin(p.tw + time * 2.5);
        const s = p.size * (1 + morph * 0.6) * tw * 2.1;
        ctx.globalAlpha = Math.min(1, 0.5 * tw + morph * 0.35) * (onPath || morph > 0 ? 1 : 0);
        ctx.drawImage(p.sprite, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // big multiplier readout, fades out as the star forms. Kept clear of the
      // fixed navbar + promo bar (~120px) so it never gets clipped behind them.
      if (morph < 0.9) {
        const m = multAt(head);
        ctx.font = `900 ${Math.min(w * 0.12, 120)}px "Arial Narrow", Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 1 - clamp01(morph / 0.9);
        ctx.fillStyle = `rgba(${mr},${mg},${mb},0.95)`;
        ctx.shadowColor = `rgba(${mr},${mg},${mb},0.7)`;
        ctx.shadowBlur = 22;
        ctx.fillText(m.toFixed(2) + "×", cx, Math.max(h * 0.27, 172));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // "BUST" stamp at the crash floor
      if (head > P2 - 0.02 && head < P3 + 0.05) {
        const a = 1 - Math.abs(head - (P2 + 0.04)) / 0.1;
        if (a > 0) {
          const [bx, by] = chartAt(head);
          ctx.globalAlpha = clamp01(a);
          ctx.font = `900 ${Math.min(w * 0.05, 44)}px "Arial Narrow", Arial, sans-serif`;
          ctx.fillStyle = "rgba(255,84,64,1)";
          ctx.textAlign = "center";
          // Pinned to the upper band (never below 0.55h) so it can't collide with
          // the bottom caption regardless of where the dip bottoms out.
          ctx.fillText("BUST", bx, Math.min(by - 34, h * 0.55));
          ctx.globalAlpha = 1;
        }
      }

      // "LOAN +" lifeline stamp on the recovery bump
      if (head > P3 && head < P4 + 0.04) {
        const a = 1 - Math.abs(head - (P3 + (P4 - P3) / 2)) / 0.1;
        if (a > 0) {
          const [lx, ly] = chartAt(head);
          ctx.globalAlpha = clamp01(a);
          ctx.font = `900 ${Math.min(w * 0.045, 40)}px "Arial Narrow", Arial, sans-serif`;
          ctx.fillStyle = "rgba(78,222,170,1)";
          ctx.shadowColor = "rgba(78,222,170,0.7)";
          ctx.shadowBlur = 16;
          ctx.textAlign = "center";
          ctx.fillText("+ LOAN", lx, ly - 26);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      if (running) raf = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) {
      disp = 1;
      progRef.current = 1;
      render();
    } else {
      const io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting && !running) {
            running = true;
            raf = requestAnimationFrame(render);
          } else if (!e.isIntersecting) {
            running = false;
            cancelAnimationFrame(raf);
          }
        },
        { threshold: 0 }
      );
      io.observe(canvas);
      return () => {
        io.disconnect();
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
      };
    }
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <section className="fe-story fe-story--tall" ref={sectionRef}>
      <div className="fe-story__sticky">
        <canvas ref={canvasRef} className="fe-story__canvas" />
        <div className="fe-story__beats">
          {BEATS.map((b) => (
            <Beat key={b.k} progress={scrollYProgress} beat={b} />
          ))}
        </div>
      </div>
    </section>
  );
}
