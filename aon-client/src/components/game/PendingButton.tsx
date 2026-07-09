"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface PendingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** true while the bet is in flight (Place Bet clicked, round not started yet). */
    pending: boolean;
    /** Label shown while pending, e.g. "Dealing…". */
    pendingLabel: string;
    children: ReactNode;
}

/**
 * The standard `.game-primary` button with a built-in pending state:
 * while `pending` it disables itself and swaps the label for an inline
 * spinner + `pendingLabel`, without any layout shift. Pair with the
 * `.game-board.is-staging` board state (see GAME_CHROME.md).
 */
export default function PendingButton({
    pending,
    pendingLabel,
    children,
    className = "",
    disabled,
    ...rest
}: PendingButtonProps) {
    return (
        <button
            className={`game-primary${pending ? " is-pending" : ""}${className ? ` ${className}` : ""}`}
            disabled={pending || disabled}
            aria-busy={pending}
            {...rest}
        >
            {pending ? (
                <span className="gp-pending">
                    <span className="gp-spinner" aria-hidden="true" />
                    {pendingLabel}
                </span>
            ) : (
                children
            )}
        </button>
    );
}
