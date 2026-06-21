"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * A glowing dual-ring cursor (desktop / fine-pointer only). The outer ring lags
 * via a spring and swells over interactive elements — a small "wow" detail that
 * reads as hand-crafted, not templated. Disabled on touch devices.
 */
export default function CustomCursor() {
    const [enabled, setEnabled] = useState(false);
    const [hot, setHot] = useState(false);

    const x = useMotionValue(-100);
    const y = useMotionValue(-100);
    const ringX = useSpring(x, { stiffness: 320, damping: 28, mass: 0.6 });
    const ringY = useSpring(y, { stiffness: 320, damping: 28, mass: 0.6 });

    useEffect(() => {
        if (!window.matchMedia("(pointer: fine)").matches) return;
        setEnabled(true);
        document.body.classList.add("fe-cursor-on");

        const move = (e: MouseEvent) => {
            x.set(e.clientX);
            y.set(e.clientY);
            const t = e.target as HTMLElement;
            setHot(!!t.closest("a, button, [data-cursor]"));
        };
        window.addEventListener("mousemove", move);
        return () => {
            window.removeEventListener("mousemove", move);
            document.body.classList.remove("fe-cursor-on");
        };
    }, [x, y]);

    if (!enabled) return null;

    return (
        <>
            <motion.div className="fe-cursor-dot" style={{ x, y }} animate={{ scale: hot ? 0.4 : 1 }} />
            <motion.div
                className="fe-cursor-ring"
                style={{ x: ringX, y: ringY }}
                animate={{ scale: hot ? 1.8 : 1, opacity: hot ? 1 : 0.5 }}
            />
        </>
    );
}
