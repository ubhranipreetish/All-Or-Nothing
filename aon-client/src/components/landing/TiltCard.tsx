"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * 3D parallax tilt on pointer move (CSS perspective — no WebGL). The element
 * rotates toward the cursor and a glare sheen tracks across it. Touch devices
 * just get the static card.
 */
export default function TiltCard({
    children,
    className = "",
    max = 12,
}: {
    children: React.ReactNode;
    className?: string;
    max?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const px = useMotionValue(0.5);
    const py = useMotionValue(0.5);

    const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
    const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
    const glareX = useTransform(px, [0, 1], ["0%", "100%"]);

    const onMove = (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
    };
    const reset = () => {
        px.set(0.5);
        py.set(0.5);
    };

    return (
        <motion.div
            ref={ref}
            className={`fe-tilt ${className}`}
            onMouseMove={onMove}
            onMouseLeave={reset}
            style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
        >
            {children}
            <motion.span className="fe-tilt__glare" style={{ left: glareX }} aria-hidden />
        </motion.div>
    );
}
