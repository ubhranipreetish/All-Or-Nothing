import { Request, Response, NextFunction } from "express";

// Allowed origins (your frontend URLs)
const ALLOWED_ORIGINS = [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "https://all-or-nothing.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
];

/**
 * Check if an origin is allowed.
 * Supports exact matches from the list AND any Vercel preview/deployment URL
 * matching the pattern: https://all-or-nothing-*.vercel.app
 */
const isOriginAllowed = (origin: string): boolean => {
    // Check exact matches (using startsWith for sub-path flexibility)
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
        return true;
    }

    // Match Vercel preview/deployment URLs:
    // e.g. https://all-or-nothing-abc123-username.vercel.app
    if (/^https:\/\/all-or-nothing[a-z0-9-]*\.vercel\.app$/.test(origin)) {
        return true;
    }

    return false;
};

/**
 * Middleware to validate requests come from allowed origins only
 * Blocks Postman, curl, and other direct API access
 */
export const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
    // Skip for health check and warmup
    if (req.path === "/health" || req.path === "/warmup") {
        return next();
    }

    const origin = req.get("Origin");
    const referer = req.get("Referer");
    const userAgent = req.get("User-Agent") || "";

    // Block common API testing tools
    const blockedUserAgents = ["postman", "insomnia", "curl", "httpie", "wget"];
    const isBlockedAgent = blockedUserAgents.some(agent =>
        userAgent.toLowerCase().includes(agent)
    );

    if (isBlockedAgent) {
        console.warn(`Blocked request from user-agent: ${userAgent}`);
        return res.status(403).json({
            message: "Direct API access is not allowed"
        });
    }

    // Check Origin header
    if (origin) {
        if (isOriginAllowed(origin)) {
            return next();
        }
    }

    // Check Referer header as fallback
    if (referer) {
        // Extract origin from referer (e.g. https://example.com/path -> https://example.com)
        try {
            const refererOrigin = new URL(referer).origin;
            if (isOriginAllowed(refererOrigin)) {
                return next();
            }
        } catch {
            // Invalid referer URL, continue to block
        }
    }

    // If neither Origin nor Referer is present/valid, block the request
    // Exception: Allow if it's a same-origin request (browser navigation)
    if (!origin && !referer) {
        // If no origin/referer and has sec-fetch headers, it's likely a browser
        const secFetchMode = req.get("Sec-Fetch-Mode");
        if (secFetchMode) {
            return next(); // Browser request
        }

        // For API requests, require origin header
        console.warn(`Blocked request without origin: ${req.method} ${req.path}`);
        return res.status(403).json({
            message: "Origin header required"
        });
    }

    console.warn(`Blocked request from origin: ${origin || referer}`);
    return res.status(403).json({
        message: "Access denied from this origin"
    });
};

/**
 * Strict CORS configuration
 */
export const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl) - handled by validateOrigin
        if (!origin) {
            return callback(null, true);
        }

        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

