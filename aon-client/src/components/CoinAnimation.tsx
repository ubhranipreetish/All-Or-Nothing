import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import "../styles/CoinAnimation.css";

interface Particle {
    id: number;
    x: number;
    y: number;
    moveX: number;
    moveY: number;
    delay: number;
    duration: number;
    size: number;
}

export default function CoinAnimation() {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        // Generate significantly more particles for a rich cinematic effect
        const newParticles = Array.from({ length: 50 }, (_, i) => {
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 150;
            return {
                id: i,
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                moveX: (Math.random() - 0.5) * 60,
                moveY: (Math.random() - 0.5) * 60,
                delay: Math.random() * 5,
                duration: 6 + Math.random() * 6,
                size: 2 + Math.random() * 3,
            };
        });
        setParticles(newParticles);
    }, []);

    return (
        <div className="coin-scene">
            {/* Ambient glow - blue rim lighting */}
            <motion.div
                className="ambient-glow"
                animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.5, 0.7, 0.5],
                }}
                transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* Blue floating particles - Centered around origin */}
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    className="particle"
                    style={{
                        width: particle.size,
                        height: particle.size,
                        left: '50%',
                        top: '50%',
                    }}
                    initial={{
                        x: particle.x,
                        y: particle.y,
                        opacity: 0,
                        scale: 0,
                    }}
                    animate={{
                        x: [particle.x, particle.x + particle.moveX, particle.x],
                        y: [particle.y, particle.y + particle.moveY, particle.y],
                        opacity: [0, 0.8, 0],
                        scale: [0, 1.2, 0],
                    }}
                    transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            ))}

            {/* 3D Coin with seamless rotation */}
            <motion.div
                className="coin-wrapper"
                animate={{
                    rotateY: [0, 180, 360],
                }}
                transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.5, 1],
                }}
            >
                {/* Front Face - ALL */}
                <div className="coin-face front">
                    <div className="coin-inner-ring">
                        <span className="coin-text">ALL</span>
                    </div>
                    <div className="coin-shine" />
                    <div className="coin-rim-light" />
                </div>

                {/* Back Face - NOTHING */}
                <div className="coin-face back">
                    <div className="coin-inner-ring">
                        <span className="coin-text">NOTHING</span>
                    </div>
                    <div className="coin-shine" />
                    <div className="coin-rim-light" />
                </div>
            </motion.div>

            {/* Ground shadow */}
            <motion.div
                className="ground-shadow"
                animate={{
                    scaleX: [1, 0.8, 1],
                    opacity: [0.4, 0.25, 0.4],
                }}
                transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.5, 1],
                }}
            />
        </div>
    );
}
