import { Request, Response, NextFunction } from "express";

// Allowed origins (your frontend URLs)
const ALLOWED_ORIGINS = [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "https://all-or-nothing.vercel.app", // Add your production URL
    "http://localhost:3000",
    "http://localhost:3001",
];

/**
 * Middleware to validate requests come from allowed origins only
 * Blocks Postman, curl, and other direct API access
 */
export const validateOrigin = (req: Request, res: Response, next: NextFunction) => {
    // Skip for health check
    if (req.path === "/health") {
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
        const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed =>
            origin.startsWith(allowed)
        );
        if (isAllowedOrigin) {
            return next();
        }
    }

    // Check Referer header as fallback
    if (referer) {
        const isAllowedReferer = ALLOWED_ORIGINS.some(allowed =>
            referer.startsWith(allowed)
        );
        if (isAllowedReferer) {
            return next();
        }
    }

    // If neither Origin nor Referer is present/valid, block the request
    // Exception: Allow if it's a same-origin request (browser navigation)
    if (!origin && !referer) {
        // This could be a same-origin request or a tool like Postman
        // We'll check for browser-like behavior
        const acceptHeader = req.get("Accept") || "";
        const hasBrowserLikeAccept = acceptHeader.includes("text/html") ||
            acceptHeader.includes("application/json");

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

        const isAllowed = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};
