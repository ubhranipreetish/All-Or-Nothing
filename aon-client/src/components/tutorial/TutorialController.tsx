"use client";

import { motion, AnimatePresence } from "framer-motion";
import "../../styles/Tutorial.css";
import { TutorialController as Controller } from "./useTutorial";

interface Props {
    tutorial: Controller;
    /** Disable the "How to Play" trigger while a real round is in progress. */
    triggerDisabled?: boolean;
}

/**
 * TutorialController — the shared UI shell for every game's walkthrough:
 * the trigger button, the dimming backdrop, and the step tooltip (with a
 * progress indicator). All game-agnostic; the game supplies the step config
 * and its own demo interactions.
 */
export default function TutorialController({ tutorial, triggerDisabled }: Props) {
    const { isActive, currentStep, stepIndex, total, start, end, next } = tutorial;

    return (
        <>
            <button
                className="tutorial-trigger-btn"
                onClick={start}
                disabled={triggerDisabled}
                type="button"
            >
                🎮 How to Play
            </button>

            {/* Dimming backdrop — clicking advances info-only steps. */}
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        className="tutorial-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                            if (!currentStep?.highlight) next();
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Step tooltip — fixed bottom-center, above everything. */}
            <AnimatePresence>
                {isActive && currentStep && (
                    <motion.div
                        className="tutorial-tooltip"
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        key={stepIndex}
                    >
                        <div className="tutorial-progress">
                            {Array.from({ length: total }).map((_, i) => (
                                <span
                                    key={i}
                                    className={`tutorial-dot ${i === stepIndex ? "active" : ""} ${
                                        i < stepIndex ? "done" : ""
                                    }`}
                                />
                            ))}
                        </div>

                        <h3 className="tutorial-title">{currentStep.title}</h3>
                        <p className="tutorial-message">{currentStep.message}</p>

                        {currentStep.action === "start-button" ? (
                            <button
                                className="tutorial-start-btn"
                                type="button"
                                onClick={() => (currentStep.id === "complete" ? end() : next())}
                            >
                                {currentStep.id === "complete" ? "Start Playing" : "Start Tutorial"}
                            </button>
                        ) : (
                            <p className="tutorial-action">{currentStep.action}</p>
                        )}

                        <button className="tutorial-skip-btn" type="button" onClick={end}>
                            Skip Tutorial
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
