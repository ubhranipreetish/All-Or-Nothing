"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A single guided-tutorial step shared by every game. */
export interface TutorialStep {
    /** Stable id used to branch game-specific demo logic (e.g. "reveal-tile"). */
    id: string;
    title: string;
    message: string;
    /** Either descriptive instruction text, or the sentinel "start-button". */
    action: string;
    /** DOM id of the element to highlight, or "" for an info-only step. */
    highlight: string;
}

interface UseTutorialOptions {
    /** Game-specific reset run when the tutorial starts (clear demo state). */
    onStart?: () => void;
    /** Game-specific cleanup run when the tutorial ends or is skipped. */
    onEnd?: () => void;
}

/**
 * useTutorial — the shared engine behind every game's "How to Play" walkthrough.
 *
 * It owns ONLY the step-machine (which step we're on, advancing, targeting and
 * highlighting). Each game keeps its own demo state (a controlled board, a fake
 * spin, ...) and calls `next()` when the player completes the interactive step.
 */
export function useTutorial(steps: TutorialStep[], options: UseTutorialOptions = {}) {
    const { onStart, onEnd } = options;

    const [isActive, setIsActive] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);

    // Hold the latest callbacks in refs so our handlers stay referentially
    // stable across renders (the caller passes new inline functions each render).
    const onStartRef = useRef(onStart);
    const onEndRef = useRef(onEnd);
    useEffect(() => {
        onStartRef.current = onStart;
        onEndRef.current = onEnd;
    });

    const currentStep = isActive ? steps[stepIndex] : null;

    const start = useCallback(() => {
        onStartRef.current?.();
        setStepIndex(0);
        setIsActive(true);
    }, []);

    const end = useCallback(() => {
        setIsActive(false);
        setStepIndex(0);
        onEndRef.current?.();
    }, []);

    // IMPORTANT: keep the setState updater pure (no nested setState / side
    // effects). Under StrictMode an impure updater is re-invoked and cascades
    // into an infinite render loop ("Maximum update depth exceeded"). We read
    // the current index from the closure and branch in the handler instead.
    const next = useCallback(() => {
        if (stepIndex >= steps.length - 1) {
            end();
        } else {
            setStepIndex(stepIndex + 1);
        }
    }, [stepIndex, steps.length, end]);

    /** True when `id` is the element the current step wants the player to use. */
    const isTarget = useCallback(
        (id: string) => isActive && !!currentStep && currentStep.highlight === id,
        [isActive, currentStep]
    );

    /**
     * Advance if `id` is the current target. Returns true when it handled the
     * click, so callers can early-return and suppress the real game action.
     */
    const handleClick = useCallback(
        (id: string) => {
            if (!isActive) return false;
            if (currentStep?.highlight === id) {
                next();
                return true;
            }
            return false;
        },
        [isActive, currentStep, next]
    );

    return {
        isActive,
        stepIndex,
        total: steps.length,
        currentStep,
        start,
        end,
        next,
        isTarget,
        /** Alias kept for readability at call sites that only render a ring. */
        isHighlighted: isTarget,
        handleClick,
    };
}

export type TutorialController = ReturnType<typeof useTutorial>;
