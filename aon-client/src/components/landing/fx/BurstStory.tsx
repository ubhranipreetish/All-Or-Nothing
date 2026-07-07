"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import type { BurstHandle, BurstMount } from "./types";

/* Same four beats as the old video scrollytelling — the visual underneath is
   now a generative, scrubbable coin-burst instead of an mp4. */
const BEATS = [
  { r: [0.0, 0.22], k: "01", t: "One coin.", s: "Every fortune begins with a single, fearless flip. Virtual stakes — real nerve." },
  { r: [0.27, 0.5], k: "02", t: "Let it ride.", s: "The longer it spins, the higher it climbs. Mines, towers, wheels — all on the line." },
  { r: [0.55, 0.78], k: "03", t: "Don't blink.", s: "One heartbeat decides everything. Cash out clean — or watch it shatter." },
  { r: [0.83, 1.0], k: "04", t: "All or nothing.", s: "Heads, you walk out a legend. Tails, it's gone. Which side are you on?" },
] as const;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function Beat({
  progress,
  beat,
}: {
  progress: MotionValue<number>;
  beat: (typeof BEATS)[number];
}) {
  const [a, b] = beat.r;
  const lo = Math.max(0, a - 0.05);
  const hi = Math.min(1, b + 0.05);
  const opacity = useTransform(progress, [lo, a + 0.03, b - 0.03, hi], [0, 1, 1, 0]);
  const y = useTransform(progress, [lo, a + 0.05], [28, 0]);
  return (
    <motion.div className="fe-vstory__beat" style={{ opacity, y }}>
      <h3 className="fe-vstory__t">{beat.t}</h3>
      <p className="fe-vstory__s">{beat.s}</p>
    </motion.div>
  );
}

/**
 * Scroll-scrubbed coin-burst scrollytelling. Progress derives from the pinned
 * section's layout position (same battle-tested approach as the old video
 * version) and drives both the captions and the generative canvas — every
 * variant is a pure function of progress, so it scrubs cleanly both ways.
 */
export default function BurstStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.className = "fe-vstory__fx";
    stage.appendChild(canvas);

    let disposed = false;
    let handle: BurstHandle | null = null;
    let raf = 0;
    let running = false;
    let disp = 0;
    let last = performance.now();
    let t = 0;

    const computeProgress = () => {
      const range = section.offsetHeight - window.innerHeight;
      if (range <= 0) return 0;
      return clamp01(-section.getBoundingClientRect().top / range);
    };

    const loop = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 1 / 24);
      last = now;
      t += dt;
      const p = computeProgress();
      progress.set(p); // captions track scroll instantly
      disp += (p - disp) * 0.14; // the visual eases after it
      handle?.frame(disp, dt, t);
    };

    (async () => {
      const mod = await import("./burstSupernova");
      if (disposed) return;
      handle = (mod.mount as BurstMount)(canvas);
      handle.resize();
      if (reduce) {
        // park on the first beat, exactly like the old video did
        progress.set(0.12);
        disp = 0.12;
        handle.frame(0.12, 1 / 60, 0.001);
        return;
      }
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
      // ?fxdebug: drive the scrub directly from the console (used for QA)
      if (new URLSearchParams(window.location.search).has("fxdebug")) {
        (window as unknown as Record<string, unknown>).__fxBurst = (p: number, tt = 2) => {
          running = false;
          cancelAnimationFrame(raf);
          handle?.frame(p, 1 / 60, tt);
        };
      }
    })();

    const ro = new ResizeObserver(() => handle?.resize());
    ro.observe(stage);

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      handle?.dispose();
      canvas.remove();
    };
  }, [progress]);

  return (
    <section className="fe-vstory" ref={sectionRef}>
      <div className="fe-vstory__sticky">
        <div className="fe-vstory__stage" ref={stageRef} aria-hidden />
        <div className="fe-vstory__scrim fe-vstory__scrim--fx" aria-hidden />
        <div className="fe-vstory__beats">
          {BEATS.map((b) => (
            <Beat key={b.k} progress={progress} beat={b} />
          ))}
        </div>
      </div>
    </section>
  );
}
