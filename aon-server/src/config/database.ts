import mongoose from "mongoose";
import { env } from "./env";

/**
 * Database (Singleton)
 *
 * Owns the single Mongoose connection for the whole process. A second call to
 * connect() is a no-op, so any module can safely ask for the connection without
 * worrying about opening duplicates.
 */
class Database {
    private static instance: Database;
    private connected = false;

    private constructor() {}

    static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        try {
            await mongoose.connect(env.mongoUri);
            this.connected = true;
            console.log("MongoDB connected");
        } catch (error) {
            console.error("MongoDB connection failed", error);
            process.exit(1);
        }
    }
}

export const database = Database.getInstance();

/** Backwards-compatible helper kept so the existing entrypoint reads naturally. */
export const connectDB = () => database.connect();
