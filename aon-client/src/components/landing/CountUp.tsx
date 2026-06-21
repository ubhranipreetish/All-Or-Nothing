"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

/**
 * Counts from 0 to `to` once it scrolls into view. Used for the stats band.
 * `suffix`/`prefix` let it render things like "100%" or "₹0".
 */
export default function CountUp({
    to,
    duration = 1600,
    prefix = "",
    suffix = "",
    decimals = 0,
}: {
    to: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });
    const [val, setVal] = useState(0);

    useEffect(() => {
        if (!inView) return;
        let raf = 0;
        let start = 0;
        const step = (ts: number) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            // easeOutExpo for a punchy settle
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            setVal(to * eased);
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [inView, to, duration]);

    return (
        <span ref={ref}>
            {prefix}
            {val.toFixed(decimals)}
            {suffix}
        </span>
    );
}
