import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redisClient = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        console.log("[RedisService] Initialized Upstash Redis connection.");
    } else {
        console.warn("[RedisService] UPSTASH_REDIS credentials missing. Caching disabled.");
    }
} catch (err) {
    console.error("[RedisService] Failed to initialize Redis:", err);
}

export class RedisService {
    /**
     * Tries to get a cached AI reply for a specific question.
     * We normalize the question to ensure "Hi!" and " hi " hit the same cache.
     */
    static async getCachedResponse(ownerId: string, message: string): Promise<string | null> {
        if (!redisClient) return null;
        
        try {
            const key = `cache:${ownerId}:${this.normalizeText(message)}`;
            const cached = await redisClient.get<string>(key);
            
            if (cached) {
                console.log(`[Redis] Cache HIT for: "${message}"`);
                return cached;
            }
            return null;
        } catch (err) {
            console.error("[Redis] GET Error:", err);
            return null;
        }
    }

    /**
     * Saves a confident AI reply to the cache. TTL is set to 7 days.
     */
    static async setCachedResponse(ownerId: string, message: string, reply: string): Promise<void> {
        if (!redisClient) return;

        try {
            const key = `cache:${ownerId}:${this.normalizeText(message)}`;
            // Store for 7 days (604800 seconds)
            await redisClient.setex(key, 604800, reply);
            
            // Also store this key in a Set associated with the owner so we can invalidate them all at once
            await redisClient.sadd(`owner_keys:${ownerId}`, key);
            
            console.log(`[Redis] Cache SET for: "${message}"`);
        } catch (err) {
            console.error("[Redis] SET Error:", err);
        }
    }

    /**
     * Clears ALL cached responses for a specific business.
     * Triggered when they update their Settings or Knowledge Base.
     */
    static async invalidateOwnerCache(ownerId: string): Promise<void> {
        if (!redisClient) return;

        try {
            const setKey = `owner_keys:${ownerId}`;
            // 1. Get all cache keys for this owner
            const keys = await redisClient.smembers(setKey);
            
            if (keys.length > 0) {
                // 2. Delete all those keys
                await redisClient.del(...keys);
            }
            
            // 3. Delete the tracking set itself
            await redisClient.del(setKey);
            
            console.log(`[Redis] Invalidated ${keys.length} cached responses for owner: ${ownerId}`);
        } catch (err) {
            console.error("[Redis] INVALIDATE Error:", err);
        }
    }

    /**
     * Normalizes text to maximize cache hits.
     */
    private static normalizeText(text: string): string {
        return text.toLowerCase().trim().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
    }
}
