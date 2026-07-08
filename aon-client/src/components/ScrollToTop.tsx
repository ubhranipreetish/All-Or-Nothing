"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Route changes were preserving the previous page's scroll position
 * (Roulette → Profile landed mid-page). Jump to the top on every
 * pathname change — instantly, so html's smooth scroll-behavior
 * doesn't animate the reset.
 */
export default function ScrollToTop() {
    const pathname = usePathname();

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }, [pathname]);

    return null;
}
