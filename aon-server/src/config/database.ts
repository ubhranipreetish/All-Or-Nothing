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
            await mongoose.connect(env.mongoUri, {
                // A warm connection pool so concurrent requests don't queue on a
                // single socket. maxPoolSize caps sockets to Atlas; minPoolSize
                // keeps a few open so the first request after idle isn't slow.
                maxPoolSize: 20,
                minPoolSize: 2,
                // Fail fast instead of hanging a request for 30s if the DB is
                // briefly unreachable (e.g. Atlas failover).
                serverSelectionTimeoutMS: 8000,
                socketTimeoutMS: 45000,
            });
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
