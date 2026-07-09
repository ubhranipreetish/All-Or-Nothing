/* HERO — "CONSTELLATIONS OF THE DECK" (centered, full-bleed, subtle)
   The gambler's sky: the four card suits hang among the stars as faint violet
   constellations, joined by the dice and a casino chip. They twinkle like
   ordinary stars; on a slow cycle each one gently wakes, traces its lines in,
   whispers its name, then dissolves back into starlight. The red suits glint
   warm pink-violet. Occasional shooting star. Canvas 2D. */

import { mulberry32, clamp01, type HeroHandle, type Pointer } from "./types";

type Sigil = {
  name: string;
  pts: [number, number][];
  edges: [number, number][];
  keys: number[]; //   indices of "key stars" that get the brighter glint
  ember?: boolean; //  red suits glint ember instead of gold
};

const ring = (n: number, r: number, phase = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });

const cycle = (from: number, count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [from + i, from + ((i + 1) % count)] as [number, number]);

/* ♠ */
const spade: Sigil = {
  name: "SPADES",
  pts: [
    [0, -0.88], [0.48, -0.32], [0.6, 0.12], [0.34, 0.38], [0.1, 0.28],
    [0.2, 0.72], [-0.2, 0.72], [-0.1, 0.28], [-0.34, 0.38], [-0.6, 0.12], [-0.48, -0.32],
  ],
  edges: [...cycle(0, 11)],
  keys: [0, 5, 6],
};

/* ♥ */
const heart: Sigil = {
  name: "HEARTS",
  pts: [
    [0, 0.8], [0.42, 0.35], [0.68, -0.05], [0.62, -0.45], [0.35, -0.62], [0.08, -0.45],
    [0, -0.22], [-0.08, -0.45], [-0.35, -0.62], [-0.62, -0.45], [-0.68, -0.05], [-0.42, 0.35],
  ],
  edges: [...cycle(0, 12)],
  keys: [0, 4, 8],
  ember: true,
};

/* ♦ */
const diamond: Sigil = {
  name: "DIAMONDS",
  pts: [
    [0, -0.85], [0.3, -0.42], [0.55, 0], [0.3, 0.42],
    [0, 0.85], [-0.3, 0.42], [-0.55, 0], [-0.3, -0.42],
  ],
  edges: [...cycle(0, 8)],
  keys: [0, 4],
  ember: true,
};

/* ♣ */
const club: Sigil = {
  name: "CLUBS",
  pts: [
    [0, -0.85], [0.26, -0.62], [0.3, -0.35], [0.62, -0.28], [0.78, 0], [0.6, 0.28],
    [0.28, 0.28], [0.18, 0.72], [-0.18, 0.72], [-0.28, 0.28], [-0.6, 0.28], [-0.78, 0],
    [-0.62, -0.28], [-0.3, -0.35], [-0.26, -0.62],
  ],
  edges: [...cycle(0, 15)],
  keys: [0, 4, 11],
};

/* the dice — isometric cube with floating pip stars */
const dice: Sigil = {
  name: "THE DICE",
  pts: [
    [0, -0.85], [0.62, -0.52], [0, -0.2], [-0.62, -0.52], //  top face
    [0.62, 0.25], [0, 0.6], [-0.62, 0.25], //                 bottom rim
    [0, -0.52], //                                            pip: top face
    [0.31, -0.02], [0.31, 0.3], //                            pips: right face
    [-0.31, -0.1], [-0.31, 0.18], [-0.31, 0.44], //           pips: left face
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0], //  top diamond
    [1, 4], [2, 5], [3, 6], //          verticals
    [4, 5], [5, 6], //                  bottom rim
  ],
  keys: [7, 0],
};

/* the chip — notched ring around an inner ring */
const chipOuter = ring(10, 0.8, -Math.PI / 2);
const chipInner = ring(5, 0.45, -Math.PI / 2);
const chip: Sigil = {
  name: "THE CHIP",
  pts: [...chipOuter, ...chipInner],
  edges: [
    ...cycle(0, 10),
    ...cycle(10, 5),
    [0, 10], [2, 11], [4, 12], [6, 13], [8, 14], // notch spokes
  ],
  keys: [10, 0, 5],
};

const SIGILS: Sigil[] = [spade, heart, club, diamond, dice, chip];

/* layout slots around the centered headline (fractions of W/H):
   four corners for the suits, two top flanks for dice + chip */
const SLOTS: { x: number; y: number; s: number }[] = [
  { x: 0.15, y: 0.3, s: 0.082 },  // spade — top left
  { x: 0.85, y: 0.28, s: 0.08 },  // heart — top right
  { x: 0.13, y: 0.74, s: 0.078 }, // club — bottom left
  { x: 0.87, y: 0.72, s: 0.082 }, // diamond — bottom right
  { x: 0.32, y: 0.18, s: 0.062 }, // dice — top, left of centre
  { x: 0.68, y: 0.18, s: 0.06 },  // chip — top, right of centre
];

/* portrait phones: min(W, H) is the narrow width, which collapses the desktop
   `s` values to near-invisible — same sky, compressed, with larger fractions:
   suits hold the four corners, dice + chip flank the very top */
const SLOTS_PORTRAIT: { x: number; y: number; s: number }[] = [
  { x: 0.18, y: 0.24, s: 0.13 },  // spade — top left
  { x: 0.82, y: 0.22, s: 0.125 }, // heart — top right
  { x: 0.17, y: 0.8, s: 0.12 },   // club — bottom left
  { x: 0.83, y: 0.78, s: 0.13 },  // diamond — bottom right
  { x: 0.32, y: 0.14, s: 0.09 },  // dice — top, left of centre
  { x: 0.68, y: 0.14, s: 0.085 }, // chip — top, right of centre
];

const CYCLE = 27; // seconds for a full tour of the six constellations
const SLOT_T = CYCLE / SIGILS.length;

type Star = { x: number; y: number; z: number; tw: number; sz: number };
type Shoot = { x: number; y: number; vx: number; vy: number; life: number; max: number };

export function mount(canvas: HTMLCanvasElement): HeroHandle {
  const g = canvas.getContext("2d")!;
  let W = 0;
  let H = 0;
  let dpr = 1;

  const rand = mulberry32(52520);

  const stars: Star[] = Array.from({ length: 210 }, () => ({
    x: rand(),
    y: rand(),
    z: 0.3 + rand() * 0.7,
    tw: rand() * Math.PI * 2,
    sz: 0.6 + rand() * 1.5,
  }));
  const shoots: Shoot[] = [];
  let shootTimer = 3;

  const phases = SIGILS.map((sig) => sig.pts.map(() => rand() * Math.PI * 2));

  const resize = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 1200;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 800;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    W = canvas.width;
    H = canvas.height;
  };

  const frame = (dt: number, t: number, pointer: Pointer) => {
    g.clearRect(0, 0, W, H);

    // ---- background starfield ----
    for (const s of stars) {
      const x = s.x * W + pointer.x * 20 * s.z * dpr;
      const y = s.y * H + pointer.y * 13 * s.z * dpr;
      const a = (0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.8 + s.tw))) * s.z;
      g.fillStyle = `rgba(242,236,221,${a})`;
      g.fillRect(x, y, s.sz * dpr, s.sz * dpr);
    }

    g.globalCompositeOperation = "lighter";

    // ---- the six constellations ----
    const slots = W < H ? SLOTS_PORTRAIT : SLOTS;
    const cyc = (t / SLOT_T) % SIGILS.length;
    for (let si = 0; si < SIGILS.length; si++) {
      const sig = SIGILS[si];
      const slot = slots[si];
      let d = cyc - si;
      if (d < -SIGILS.length / 2) d += SIGILS.length;
      if (d > SIGILS.length / 2) d -= SIGILS.length;
      const active = clamp01(1 - Math.abs(d) * 2.2) ** 1.5;

      const size = Math.min(W, H) * slot.s * (1 + active * 0.06);
      const bob = Math.sin(t * 0.4 + si * 1.7) * 6 * dpr;
      const cx = slot.x * W + pointer.x * 26 * dpr + Math.cos(t * 0.3 + si) * 4 * dpr;
      const cy = slot.y * H + pointer.y * 17 * dpr + bob;

      // soft golden aura swelling behind the constellation while it's awake
      if (active > 0.03) {
        const ar = size * 1.7;
        const aura = g.createRadialGradient(cx, cy, 0, cx, cy, ar);
        aura.addColorStop(0, `rgba(139,92,246,${0.12 * active})`);
        aura.addColorStop(0.55, `rgba(139,92,246,${0.05 * active})`);
        aura.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = aura;
        g.fillRect(cx - ar, cy - ar, ar * 2, ar * 2);
      }

      // constellation lines — idle whisper, active draw-in (site gold)
      const reveal = active <= 0 ? 0 : clamp01((1 - Math.abs(d) * 1.6) * 1.6);
      const lit = Math.ceil(reveal * sig.edges.length);
      g.lineWidth = Math.max(1, 1.2 * dpr);
      g.lineCap = "round";
      for (let ei = 0; ei < sig.edges.length; ei++) {
        const [a, b] = sig.edges[ei];
        const isLit = ei < lit;
        const alpha = isLit ? 0.08 + active * 0.45 : 0.06;
        const fresh = isLit && ei === lit - 1 ? active * 0.3 : 0;
        g.strokeStyle = `rgba(167,139,250,${alpha + fresh})`;
        g.beginPath();
        g.moveTo(cx + sig.pts[a][0] * size, cy + sig.pts[a][1] * size);
        g.lineTo(cx + sig.pts[b][0] * size, cy + sig.pts[b][1] * size);
        g.stroke();
      }

      // stars at the points
      for (let pi = 0; pi < sig.pts.length; pi++) {
        const x = cx + sig.pts[pi][0] * size;
        const y = cy + sig.pts[pi][1] * size;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + phases[si][pi]);
        const key = sig.keys.includes(pi);
        const a = (0.26 + active * 0.6) * tw * (key ? 1.25 : 1);
        const r = (key ? 2.1 : 1.4) * dpr * (1 + active * 0.5);
        g.fillStyle = `rgba(196,181,253,${Math.min(0.95, a)})`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        // glint cross on key stars while active — ember for the red suits
        if (key && active > 0.25) {
          const gl = active * tw * 0.5;
          const len = 7 * dpr * active;
          g.strokeStyle = sig.ember
            ? `rgba(240,171,252,${gl})`
            : `rgba(221,214,254,${gl})`;
          g.lineWidth = dpr;
          g.beginPath();
          g.moveTo(x - len, y);
          g.lineTo(x + len, y);
          g.moveTo(x, y - len);
          g.lineTo(x, y + len);
          g.stroke();
        }
      }

      // whisper the constellation's name beneath it, in the site gold
      if (active > 0.35) {
        g.fillStyle = `rgba(167,139,250,${(active - 0.35) * 0.7})`;
        g.font = `${10 * dpr}px ui-monospace, monospace`;
        g.textAlign = "center";
        g.fillText(sig.name, cx, cy + size * 1.32);
      }
    }

    // ---- shooting star ----
    shootTimer -= dt;
    if (shootTimer <= 0 && shoots.length < 2) {
      const fromLeft = rand() < 0.5;
      shoots.push({
        x: (fromLeft ? 0.05 + rand() * 0.2 : 0.75 + rand() * 0.2) * W,
        y: (0.06 + rand() * 0.2) * H,
        vx: (fromLeft ? 1 : -1) * (0.22 + rand() * 0.12) * W,
        vy: (0.05 + rand() * 0.06) * H,
        life: 0,
        max: 0.9 + rand() * 0.5,
      });
      shootTimer = 5 + rand() * 6;
    }
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      s.life += dt;
      if (s.life >= s.max) {
        shoots.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = s.life / s.max;
      const a = Math.sin(k * Math.PI) * 0.55;
      const tail = 40 * dpr;
      const grad = g.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      grad.addColorStop(0, `rgba(216,206,255,${a})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.strokeStyle = grad;
      g.lineWidth = 1.3 * dpr;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(
        s.x - (s.vx / Math.hypot(s.vx, s.vy)) * tail,
        s.y - (s.vy / Math.hypot(s.vx, s.vy)) * tail
      );
      g.stroke();
    }

    g.globalCompositeOperation = "source-over";
  };

  const dispose = () => g.clearRect(0, 0, W, H);

  return { frame, resize, dispose };
}
