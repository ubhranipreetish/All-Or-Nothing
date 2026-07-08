"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Gem, Bomb, Coins } from "lucide-react";

interface TileData {
    revealed: boolean;
    isMine: boolean;
}

interface TileProps {
    tile: TileData;
    onClick: () => void;
    disabled?: boolean;
    isDimmed?: boolean;
    isSpotlight?: boolean;
    isKiller?: boolean;
    className?: string;
}

export default function Tile({ tile, onClick, disabled, isDimmed, isSpotlight, isKiller, className }: TileProps) {
    return (
        <div className={`tile-container ${tile.revealed ? 'revealed' : ''} ${isDimmed ? 'dimmed' : ''} ${isSpotlight ? 'spotlight' : ''} ${isKiller ? 'killer' : ''} ${className || ''}`}>
            <motion.div
                className={`tile-inner ${tile.revealed ? (tile.isMine ? "mine-reveal" : "gem-reveal") : ""}`}
                onClick={!disabled && !tile.revealed ? onClick : undefined}
                whileHover={!tile.revealed && !disabled ? {
                    scale: 1.05,
                    y: -4,
                    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)"
                } : {}}
                whileTap={!tile.revealed && !disabled ? { scale: 0.95 } : {}}
                animate={{
                    rotateY: tile.revealed ? 180 : 0,
                    scale: isSpotlight ? 1.1 : 1,
                    zIndex: isSpotlight ? 10 : 1
                }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20
                }}
            >
                {/* Front side (Unrevealed) */}
                <div className="tile-front">
                    <div className="tile-front-pattern" />
                    <div className="tile-inner-shadow" />
                </div>

                {/* Back side (Revealed) */}
                <div className="tile-back">
                    {tile.isMine ? (
                        <div className="icon-wrapper mine-icon">
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{
                                    scale: [0, 1.5, 1],
                                    opacity: 1,
                                    rotate: [0, 10, -10, 0]
                                }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                            >
                                <Bomb size={42} />
                            </motion.div>
                            <motion.div
                                className="mine-flash"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: [0, 1, 0], scale: [0.5, 2, 1] }}
                                transition={{ duration: 0.4 }}
                            />
                        </div>
                    ) : (
                        <div className="icon-wrapper gem-icon">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 10 }}
                            >
                                <Gem size={42} />
                            </motion.div>

                            {/* Floating Coin Particles (Micro-reward) */}
                            <AnimatePresence>
                                {tile.revealed && !disabled && (
                                    <motion.div className="coin-flow">
                                        {[...Array(3)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                className="mini-coin"
                                                initial={{ opacity: 0, y: 0, x: 0 }}
                                                animate={{
                                                    opacity: [0, 1, 0],
                                                    y: -60,
                                                    x: (i - 1) * 20,
                                                    scale: [0.5, 1, 0.5]
                                                }}
                                                transition={{ duration: 1, delay: i * 0.1 }}
                                            >
                                                <Coins size={16} color="var(--primary-gold)" />
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
