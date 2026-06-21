"use client";

/**
 * Full-screen film-grain + vignette overlay. Pure SVG noise, no JS cost.
 * Gives the page a tactile, cinematic texture instead of flat digital gradients.
 */
export default function Grain() {
    return (
        <div className="fe-grain" aria-hidden>
            <svg className="fe-grain__noise" xmlns="http://www.w3.org/2000/svg">
                <filter id="fe-noise">
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.8"
                        numOctaves="3"
                        stitchTiles="stitch"
                    />
                    <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect width="100%" height="100%" filter="url(#fe-noise)" />
            </svg>
            <div className="fe-vignette" />
        </div>
    );
}
