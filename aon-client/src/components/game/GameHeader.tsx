"use client";

import Link from "next/link";

export interface GameHeaderProps {
    /** Mono uppercase micro-label above the title, e.g. "Provably fair · 3 mines". */
    eyebrow: string;
    /** The big Anton display title, e.g. "MINES" or "DRAGON". */
    title: string;
    /** Optional serif-italic accent word appended to the title, e.g. "tower". */
    titleAccent?: string;
    /** Serif-italic one-liner under the title. */
    tagline: string;
    /** When provided, renders the "? How to play" ghost button. */
    onHowToPlay?: () => void;
}

/**
 * Standard header chrome for every game page. Renders the back link,
 * eyebrow + dot, display title (with optional accent word), tagline and
 * the How-to-play trigger. Styles live in Game.css under `.gh-`.
 */
export default function GameHeader({ eyebrow, title, titleAccent, tagline, onHowToPlay }: GameHeaderProps) {
    return (
        <header className="gh">
            <Link href="/#games" className="gh-back">
                <span className="gh-back__arrow" aria-hidden="true">←</span> Games
            </Link>

            <div className="gh-row">
                <div className="gh-id">
                    <span className="gh-eyebrow"><span className="gh-eyebrow__dot" /> {eyebrow}</span>
                    <h1 className="gh-title">
                        {title}
                        {titleAccent && <> <em>{titleAccent}</em></>}
                    </h1>
                    <p className="gh-tagline">{tagline}</p>
                </div>

                {onHowToPlay && (
                    <button type="button" className="gh-howto" onClick={onHowToPlay} aria-label="How to play">
                        <span className="gh-howto__q" aria-hidden="true">?</span>
                        <span>How to play</span>
                    </button>
                )}
            </div>
        </header>
    );
}
