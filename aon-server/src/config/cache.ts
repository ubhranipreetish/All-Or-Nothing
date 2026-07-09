import Redis from "ioredis";

/**
 * Cache / shared-state layer.
 *
 * Redis is OPTIONAL and enabled only when REDIS_URL is set. That is deliberate:
 * on a single instance an in-process Map is FASTER than Redis (no network hop),
 * so the default path stays fast. Redis matters once you run more than one
 * instance — then rate-limit counters and cached reads must be shared, and this
 * layer flips to Redis with zero call-site changes.
 *
 * Everything degrades gracefully: if Redis is configured but unreachable, the
 * app keeps serving from the in-memory fallback instead of crashing.
 */

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    redis.on("error", (err) => console.warn("[cache] Redis error:", err.message));
    redis.on("connect", () => console.log("[cache] Redis connected"));
}

export const isRedisEnabled = () => redis !== null;

/** Raw client for adapters that need it (e.g. rate-limit-redis). */
export const getRedisClient = (): Redis | null => redis;

// In-memory fallback with per-key TTL.
const memory = new Map<string, { value: unknown; expires: number }>();

export const cache = {
    async get<T>(key: string): Promise<T | null> {
        if (redis) {
            try {
                const raw = await redis.get(key);
                return raw ? (JSON.parse(raw) as T) : null;
            } catch {
                /* fall through to memory */
            }
        }
        const hit = memory.get(key);
        if (!hit) return null;
        if (hit.expires < Date.now()) {
            memory.delete(key);
            return null;
        }
        return hit.value as T;
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        if (redis) {
            try {
                await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
                return;
            } catch {
                /* fall through to memory */
            }
        }
        memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    },

    async del(key: string): Promise<void> {
        if (redis) {
            try {
                await redis.del(key);
            } catch {
                /* ignore */
            }
        }
        memory.delete(key);
    },
};
