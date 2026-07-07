"use client";

import { useEffect, useRef } from "react";
import type { HeroHandle, HeroMount } from "./types";

/**
 * Full-bleed hero visual — the card-suit constellations. Mounted behind a
 * dynamic import (nothing lands in the main bundle), runs a single rAF loop
 * that pauses off-screen / in hidden tabs, and feeds it a smoothed pointer.
 * Desktop only — on ≤1024px the wrapper is display:none and we never mount.
 */
export default function HeroVisual() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || window.matchMedia("(max-width: 1024px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.className = "fe-fx__canvas";
    wrap.appendChild(canvas);

    let disposed = false;
    let handle: HeroHandle | null = null;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let t = 0;
    // target (raw) vs smoothed pointer, in [-1, 1] relative to the hero section
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!handle || !visible) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 1 / 24);
      last = now;
      t += dt;
      pointer.x += (target.x - pointer.x) * Math.min(1, dt * 5);
      pointer.y += (target.y - pointer.y) * Math.min(1, dt * 5);
      handle.frame(dt, t, pointer);
    };

    (async () => {
      const mod = await import("./heroConstellations");
      if (disposed) return;
      handle = (mod.mount as HeroMount)(canvas);
      handle.resize();
      // ?fxdebug: step the scene synchronously from the console (used for QA)
      if (new URLSearchParams(window.location.search).has("fxdebug")) {
        (window as unknown as Record<string, unknown>).__fxHero = (seconds: number) => {
          visible = false; // park the live loop while stepping manually
          const steps = Math.min(Math.round(seconds * 60), 3600);
          for (let i = 1; i <= steps; i++) handle!.frame(1 / 60, i / 60, pointer);
        };
      }
      if (reduce) {
        // one settled frame, no animation
        handle.frame(1 / 60, 0.001, pointer);
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(loop);
    })();

    const hero = wrap.closest(".fe-hero") ?? wrap;
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const ro = new ResizeObserver(() => handle?.resize());
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(wrap);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      handle?.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={wrapRef} className="fe-hero__visual" aria-hidden />;
}
