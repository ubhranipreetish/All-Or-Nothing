import dotenv from "dotenv";

dotenv.config();

/**
 * Environment (Singleton)
 *
 * Loads and validates configuration ONCE at startup and exposes it through
 * typed getters. The rest of the codebase never touches `process.env` directly,
 * so misconfiguration fails fast and in one place.
 */
class Environment {
    private static instance: Environment;

    readonly port: number;
    readonly mongoUri: string;
    readonly googleClientId: string;
    readonly jwtSecret: string;
    readonly jwtExpiresIn: string;
    readonly frontendUrl: string;

    private constructor() {
        this.port = Number(process.env.PORT) || 5000;
        this.mongoUri = this.required("MONGO_URI");
        this.googleClientId = this.required("GOOGLE_CLIENT_ID");
        this.jwtSecret = this.required("JWT_SECRET");
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
        this.frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    }

    static getInstance(): Environment {
        if (!Environment.instance) {
            Environment.instance = new Environment();
        }
        return Environment.instance;
    }

    private required(key: string): string {
        const value = process.env[key];
        if (!value) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
        return value;
    }
}

export const env = Environment.getInstance();
