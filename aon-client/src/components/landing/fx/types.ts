/* Shared contracts for the landing FX modules (hero visuals + burst story).
   Every effect is a plain factory over a <canvas> so three.js / 2D contexts
   stay out of React and can be code-split behind dynamic imports. */

export type Pointer = { x: number; y: number };

/** Time-driven hero scene (right side of the hero). */
export type HeroHandle = {
  /** dt seconds, t seconds since mount, pointer in [-1, 1] hero-local coords. */
  frame(dt: number, t: number, pointer: Pointer): void;
  resize(): void;
  dispose(): void;
};

/** Scroll-driven burst scene. Must be a pure function of `p` (plus gentle
    time-based shimmer) so scrubbing backwards replays perfectly. */
export type BurstHandle = {
  /** p in [0, 1] section scroll progress, dt/t in seconds. */
  frame(p: number, dt: number, t: number): void;
  resize(): void;
  dispose(): void;
};

export type HeroMount = (canvas: HTMLCanvasElement) => HeroHandle;
export type BurstMount = (canvas: HTMLCanvasElement) => BurstHandle;

export const DPR_CAP = 1.75;

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG so scrub-driven effects replay identically. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
