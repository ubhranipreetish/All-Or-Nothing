"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "../styles/SpinningCoin.css";

export default function SpinningCoin() {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="coin-container"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Glow effect */}
            <motion.div
                className="coin-glow"
                animate={{
                    scale: isHovered ? 1.3 : 1,
                    opacity: isHovered ? 1 : 0.6,
                }}
                transition={{ duration: 0.3 }}
            />

            {/* Sparks on hover */}
            <AnimatePresence>
                {isHovered && (
                    <>
                        {[...Array(8)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="spark"
                                initial={{
                                    opacity: 0,
                                    scale: 0,
                                    x: 0,
                                    y: 0
                                }}
                                animate={{
                                    opacity: [0, 1, 0],
                                    scale: [0, 1, 0.5],
                                    x: Math.cos((i * Math.PI * 2) / 8) * 120,
                                    y: Math.sin((i * Math.PI * 2) / 8) * 120
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                    duration: 0.8,
                                    delay: i * 0.05,
                                    repeat: Infinity,
                                    repeatDelay: 0.5
                                }}
                            />
                        ))}
                    </>
                )}
            </AnimatePresence>

            {/* 3D Coin - Toss rotation on X axis */}
            <motion.div
                className="coin"
                animate={{
                    rotateX: [0, 360],
                }}
                transition={{
                    duration: isHovered ? 1.5 : 4,
                    repeat: Infinity,
                    ease: "linear",
                }}
            >
                {/* Front face - ALL */}
                <div className="coin-face coin-front">
                    <span className="coin-text">ALL</span>
                    <div className="coin-shine" />
                </div>

                {/* Back face - NOTHING */}
                <div className="coin-face coin-back">
                    <span className="coin-text coin-text-small">NOTHING</span>
                    <div className="coin-shine" />
                </div>
            </motion.div>

            {/* Shadow below coin */}
            <motion.div
                className="coin-shadow"
                animate={{
                    scale: isHovered ? [1, 0.8, 1] : [1, 0.9, 1],
                    opacity: isHovered ? [0.4, 0.2, 0.4] : [0.3, 0.2, 0.3],
                }}
                transition={{
                    duration: isHovered ? 0.75 : 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        </div>
    );
}
