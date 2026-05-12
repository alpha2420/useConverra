import connectDb from "@shared/lib/db";
import Settings from "@backend/models/settings.model";
import User from "@backend/models/user.model";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@shared/lib/env";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ChatPipelineService } from "@backend/services/ChatPipelineService";

// Optional Rate Limiting Setup
let ratelimit: Ratelimit | null = null;
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
        analytics: true,
        prefix: "@upstash/ratelimit-support-ai",
    });
} else {
    console.warn("⚠️ Rate limiting is disabled: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are missing.");
}

export async function POST(req: NextRequest) {
    try {
        const { message, ownerId, history } = await req.json();
        if (!message || !ownerId) {
            return NextResponse.json(
                { message: "message and owner id is required" },
                { status: 400 }
            );
        }

        await connectDb();
        
        // 1. User & Credits Check
        const user = await User.findById(ownerId);
        if (user && user.credits <= 0 && !user.isSuperAdmin) {
            console.log(`[Chat] User ${ownerId} has no credits remaining.`);
            return NextResponse.json({ reply: "Sorry, I've reached my daily limit for today. Please try again later." });
        }

        // 2. Rate Limiting Check
        if (ratelimit) {
            const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
            const { success, limit, remaining, reset } = await ratelimit.limit(`chat_${ip}`);
            
            if (!success) {
                return NextResponse.json(
                    { message: "Too many requests. Please try again later." },
                    { 
                        status: 429,
                        headers: {
                            "X-RateLimit-Limit": limit.toString(),
                            "X-RateLimit-Remaining": remaining.toString(),
                            "X-RateLimit-Reset": reset.toString(),
                        }
                    }
                );
            }
        }

        // 3. Settings Check
        const setting = await Settings.findOne({ ownerId });
        if (!setting) {
            return NextResponse.json(
                { message: "chat bot is not configured yet." },
                { status: 400 }
            );
        }

        // 4. Delegate to the Chat Pipeline Service
        const result = await ChatPipelineService.executeChat(ownerId, message, history, setting);

        // 5. Handle Errors from Pipeline
        if (typeof result === 'object' && result !== null && 'error' in result) {
             return NextResponse.json({ message: result.error }, { status: result.status });
        }

        // 6. Return standard response
        const response = NextResponse.json(result);
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        return response;

    } catch (error) {
        console.error("Chat API error:", error);
        const errResponse = NextResponse.json(
            { message: "An internal server error occurred processing the chat." },
            { status: 500 }
        );
        errResponse.headers.set("Access-Control-Allow-Origin", "*");
        errResponse.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        errResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");
        return errResponse;
    }
}

export const OPTIONS = async () => {
    return NextResponse.json(null, {
        status: 201,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    });
}