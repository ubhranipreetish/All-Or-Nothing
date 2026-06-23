"use client";

/* Tiny WebAudio blips — no asset files. Used for deal / your-turn / chips / win.
   Guarded for SSR and browsers without AudioContext; fully optional + mutable. */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
    enabled = v;
}
export function isSoundEnabled() {
    return enabled;
}

function tone(freq: number, durMs: number, type: OscillatorType = "sine", gain = 0.04) {
    if (!enabled || typeof window === "undefined") return;
    try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = ctx || new AC();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const now = ctx.currentTime;
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
        o.start(now);
        o.stop(now + durMs / 1000);
    } catch {
        /* ignore */
    }
}

export const sounds = {
    deal: () => tone(440, 55, "triangle", 0.025),
    turn: () => tone(680, 130, "sine", 0.05),
    chip: () => tone(280, 45, "square", 0.02),
    win: () => {
        tone(523, 130, "sine", 0.05);
        setTimeout(() => tone(659, 130, "sine", 0.05), 120);
        setTimeout(() => tone(784, 200, "sine", 0.05), 250);
    },
};
