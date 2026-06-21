"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";

/* The four beats that cross-fade as the coin clip is scrubbed by scroll. */
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
  const pad = 0.05;
  const lo = Math.max(0, a - pad);
  const hi = Math.min(1, b + pad);
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
 * Scroll-scrubbed video scrollytelling (Apple-style). Progress is derived
 * directly from the pinned section's position in the viewport (layout-based),
 * which is rock-solid across browsers and scroll containers, then used to set
 * the video's playback head and to cross-fade the captions.
 */
export default function ScrollStoryVideo() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progress = useMotionValue(0);

  useEffect(() => {
    const video = videoRef.current!;
    const section = sectionRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let running = false;
    let disp = 0;
    let duration = 0;

    // The video element paints opaque black until its first frame is decoded,
    // which flashes a black box as the section scrolls in. Keep it transparent
    // (the warm section background shows through) until a real frame is painted,
    // then fade it in.
    const reveal = () => video.classList.add("is-ready");
    video.addEventListener("seeked", reveal, { once: true });

    const onMeta = () => {
      duration = video.duration || 0;
      // Decode an early non-black frame up front so there's never a black flash.
      if (duration && video.currentTime < 0.04) {
        try {
          video.currentTime = Math.min(0.08, duration * 0.02);
        } catch {}
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();
    video.pause();

    const computeProgress = () => {
      const range = section.offsetHeight - window.innerHeight;
      if (range <= 0) return 0;
      return clamp01(-section.getBoundingClientRect().top / range);
    };

    const loop = () => {
      const p = computeProgress();
      progress.set(p); // drives the captions instantly
      if (duration) {
        disp += (p - disp) * 0.12; // smooth the video scrub
        // Floor at a small offset so we never seek to a (often black) frame 0.
        const t = Math.min(duration - 0.04, Math.max(duration * 0.02, disp * duration));
        // Seek only on a meaningful delta and when the decoder is free. Off-screen
        // the progress clamps to 0/1, so this naturally stops seeking.
        if (!video.seeking && Math.abs(video.currentTime - t) > 0.015) {
          video.currentTime = t;
        }
      }
      if (running) raf = requestAnimationFrame(loop);
    };

    if (reduce) {
      const park = () => {
        progress.set(0.12);
        if (video.duration) video.currentTime = video.duration * 0.12;
      };
      if (video.readyState >= 1) park();
      else video.addEventListener("loadedmetadata", park, { once: true });
      reveal();
      return () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("seeked", reveal);
      };
    }

    // One lightweight rAF for the lifetime of the section (reads layout each
    // frame). Robust across scroll containers and verifiable under automation.
    running = true;
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", reveal);
    };
  }, [progress]);

  return (
    <section className="fe-vstory" ref={sectionRef}>
      <div className="fe-vstory__sticky">
        <video
          ref={videoRef}
          className="fe-vstory__video"
          src="/Videos/Golden_coin.mp4"
          muted
          playsInline
          preload="auto"
        />
        <div className="fe-vstory__scrim" aria-hidden />
        <div className="fe-vstory__beats">
          {BEATS.map((b) => (
            <Beat key={b.k} progress={progress} beat={b} />
          ))}
        </div>
      </div>
    </section>
  );
}
