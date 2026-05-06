import connectDb from "@shared/lib/db";
import Settings from "@backend/models/settings.model";
import UnansweredQuestion from "@backend/models/unanswered-question.model";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@shared/lib/env";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getCachedReply, setCachedReply } from "@backend/services/responseCache";
import { preprocessMessage } from "@backend/services/preprocessMessage";
import { getEmbedding, cosineSimilarity, rankAndFilterChunks } from "@shared/lib/embeddings";
import KnowledgeChunk from "@backend/models/knowledge.model";
import Location from "@backend/models/location.model";
import { classifyIntent, getIntentReply } from "@shared/lib/intentClassifier";
import { matchHardcodedIntent } from "@shared/lib/hardcodedRules";
import User from "@backend/models/user.model";
import { logUsage } from "@shared/lib/usage";

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
        const { message, ownerId, history } = await req.json()
        if (!message || !ownerId) {
            return NextResponse.json(
                { message: "message and owner id is required" },
                { status: 400 }
            )
        }

        await connectDb();
        const user = await User.findById(ownerId);
        if (user && user.credits <= 0 && !user.isSuperAdmin) {
            console.log(`[Chat] User ${ownerId} has no credits remaining.`);
            return NextResponse.json({ reply: "Sorry, I've reached my daily limit for today. Please try again later." });
        }

        // ── Token Compression: 2 messages of memory max ──
        type HistoryEntry = { role: string; parts?: { text: string }[]; content?: string };
        const recentHistory: HistoryEntry[] = Array.isArray(history) ? history.slice(-2) : [];
        const memoryLines = recentHistory
            .map((h: HistoryEntry) => {
                const text = h.parts?.[0]?.text || h.content || "";
                const role = h.role === "user" ? "User" : "Bot";
                return text ? `${role}: ${text.slice(0, 150)}` : null;
            })
            .filter(Boolean);
        const conversationMemory = memoryLines.length > 0
            ? `\nCONVERSATION SO FAR:\n${memoryLines.join("\n")}\n`
            : "";
        // ─────────────────────────────────────────────────────────────────────

        // ── Pre-process: clean slang, emojis, filler before anything else ─────────
        const cleanMessage = preprocessMessage(message);
        console.log(`[Chat] Raw: "${message}" → Clean: "${cleanMessage}"`);

        // --- Rate Limiting ---
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
                )
            }
        }
        // ---------------------

        await connectDb()
        const setting = await Settings.findOne({ ownerId })
        if (!setting) {
            return NextResponse.json(
                { message: "chat bot is not configured yet." },
                { status: 400 }
            )
        }

        // --- Greeting short-circuit ---
        const greetingPattern = /^\s*(hello|hi|hey|hiya|howdy|greetings|sup|what'?s up|good (morning|afternoon|evening))\s*[!.?]?\s*$/i;
        if (greetingPattern.test(message)) {
            const businessName = setting.businessName || "us";
            const greetingReply = `Hello! 👋 Welcome to ${businessName}. How can I help you today?`;
            const response = NextResponse.json(greetingReply);
            response.headers.set("Access-Control-Allow-Origin", "*");
            response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
            response.headers.set("Access-Control-Allow-Headers", "Content-Type");
            return response;
        }
        // ------------------------------

        // --- Layer 1.5: Custom AI Overrides (User-defined Rules) ---
        if (setting.aiOverrides && (setting.aiOverrides as any).length > 0) {
            const cleanMsg = message.toLowerCase().trim();
            const override = (setting.aiOverrides as any).find((o: any) => 
                cleanMsg.includes(o.topic.toLowerCase().trim())
            );
            if (override) {
                console.log(`[Chat] Override hit for topic: "${override.topic}"`);
                const response = NextResponse.json(override.response);
                response.headers.set("Access-Control-Allow-Origin", "*");
                response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
                response.headers.set("Access-Control-Allow-Headers", "Content-Type");
                return response;
            }
        }
        // -----------------------------------------------------------

        // --- Layer 1.7: Elite 50-Query Hardcoded Rule Engine ---
        const hardcodedIntent = matchHardcodedIntent(cleanMessage);
        if (hardcodedIntent) {
            console.log(`[Elite] Hardcoded match: ${hardcodedIntent}`);
            // Try to find a direct High Priority answer in the DB for this intent
            const directChunk = await KnowledgeChunk.findOne({ 
                ownerId, 
                intent: hardcodedIntent,
                priority: "high"
            }).lean();
            
            if (directChunk && directChunk.chunkText.includes("A:")) {
                const answer = directChunk.chunkText.split("A:")[1]?.trim();
                if (answer) {
                    console.log(`[Elite] Zero-LLM direct answer found for intent: ${hardcodedIntent}`);
                    const response = NextResponse.json(answer);
                    response.headers.set("Access-Control-Allow-Origin", "*");
                    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
                    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
                    return response;
                }
            }
        }
        // -----------------------------------------------------------

        // --- Layers 2-6: Rule-Based Intent Classification ---
        const intent = classifyIntent(cleanMessage);
        console.log(`[Chat] Intent classified: "${intent}" for owner ${ownerId}`);

        const intentReply = getIntentReply(intent, {
            businessName: setting.businessName,
            supportEmail: setting.supportEmail,
            whatsappNumber: setting.whatsappNumber,
            knowledge: setting.knowledge || "",
        });

        if (intentReply !== null) {
            console.log(`[Chat] Intent fast-return: "${intent}" — no AI call.`);
            const response = NextResponse.json(intentReply);
            response.headers.set("Access-Control-Allow-Origin", "*");
            response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
            response.headers.set("Access-Control-Allow-Headers", "Content-Type");
            return response;
        }
        // Only unknown intents OR knowledge-backed intents fall through to AI
        // --------------------------------------------------------------------

        // ── Cache Check (Bucket First, then Semantic) ─────
        // We pass 'undefined' for embedding initially to avoid unnecessary API calls if it's an intent hit
        const cachedAnswer = await getCachedReply(ownerId, cleanMessage, undefined, intent);
        
        if (cachedAnswer) {
            const cachedResponse = NextResponse.json(cachedAnswer);
            cachedResponse.headers.set("Access-Control-Allow-Origin", "*");
            cachedResponse.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
            cachedResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");
            return cachedResponse;
        }

        // --- Pre-RAG Gate: Only generate embedding if cache missed ---
        let queryEmbedding: number[] | undefined;
        try {
            queryEmbedding = await getEmbedding(cleanMessage);
        } catch (err) {
            console.error("[Chat] Embedding generation failed:", err);
        }
        // ───────────────────────────────

        // --- RAG: Enhanced Dynamic Knowledge Retrieval ---
        let retrievedKnowledge = "";
        if (queryEmbedding) {
            try {
                const chunks = await KnowledgeChunk.find({ ownerId }).lean();
                console.log(`[RAG] Found ${chunks.length} total chunks for ownerId: "${ownerId}"`);
                if (chunks.length > 0) {
                    // 1. Calculate base semantic scores with Metadata Boosting
                    const scored = chunks.map(c => {
                        let score = cosineSimilarity(queryEmbedding!, c.embedding);
                        console.log(`[RAG] Chunk: "${c.chunkText.slice(0, 30)}..." | Raw Score: ${score.toFixed(3)}`);
                        
                        // Boost for matching detected intent
                        if (c.intent && (c.intent === hardcodedIntent || c.intent === intent)) {
                            score += 0.15;
                        }
                        
                        // Boost for high-priority facts
                        // Boost for high-priority facts
                        if (c.priority === "high") {
                            score += 0.05;
                        }
                        
                        return { 
                            text: c.chunkText, 
                            embedding: (c as any).embedding,
                            score 
                        };
                    });

                    // 2. High-precision rerank and filter (BM25-lite + De-dupe)
                    const refined = rankAndFilterChunks(cleanMessage, scored, 5);
                    console.log(`[RAG] Retrieved ${refined.length} chunks. Top score: ${scored[0]?.score.toFixed(3)}`);
                    
                    if (refined.length === 0) {
                        console.log(`[RAG] No confident chunks found (score < 0.70). Skipping AI.`);
                        const response = NextResponse.json("I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏");
                        response.headers.set("Access-Control-Allow-Origin", "*");
                        response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
                        response.headers.set("Access-Control-Allow-Headers", "Content-Type");
                        return response;
                    }
                    
                    // ── 🚀 ZERO-LLM SELECTION LAYER ──
                    // If we have a near-perfect match (>0.90) for a Q&A unit, return answer directly
                    if (refined.length > 0) {
                        const topChunk = scored.find(s => s.text === refined[0]);
                        if (topChunk && topChunk.score > 0.90 && topChunk.text.includes("A:")) {
                            const directAnswer = topChunk.text.split("A:")[1]?.trim();
                            if (directAnswer) {
                                console.log(`[Zero-LLM] Selection hit! Score: ${topChunk.score.toFixed(3)} | Skipping AI.`);
                                const response = NextResponse.json(directAnswer);
                                response.headers.set("Access-Control-Allow-Origin", "*");
                                response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
                                response.headers.set("Access-Control-Allow-Headers", "Content-Type");
                                return response;
                            }
                        }
                    }
                    // ─────────────────────────────────
 
                    retrievedKnowledge = refined.join("\n---\n");
                    console.log(`[RAG] Final Knowledge length: ${retrievedKnowledge.length} characters.`);
                }
            } catch (ragErr) {
                console.error("[RAG] Retrieval error:", ragErr);
            }
        }

        // --- 4.5: Prepare Unified Knowledge context ---
        const bizInfo = `Business: ${setting.businessName || "us"}\nContact: ${setting.supportEmail || "N/A"}\nWhatsApp: ${setting.whatsappNumber || "N/A"}`;
        const mediaInfo = (setting.mediaLinks as any)?.length > 0 
            ? `\nAvailable Media/Product Links:\n${(setting.mediaLinks as any).map((l: any) => `- ${l.name}: ${l.url}`).join("\n")}`
            : "";
        const overrideInfo = (setting.aiOverrides as any)?.length > 0
            ? `\n\n--- AI OVERRIDES (STRICT RULES) ---\nIf the user's intent or meaning matches any of these topics, YOU MUST output the exact corresponding response.\n${(setting.aiOverrides as any).map((o: any) => `Topic/Intent: "${o.topic}" -> Exact Response: "${o.response}"`).join("\n")}`
            : "";
        
        const faqsInfo = (setting.faqs as any)?.length > 0 
            ? `\n\n--- FAQs (STRICT TRUTH) ---\n${(setting.faqs as any).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n")}`
            : "";

        const policiesInfo = setting.policies 
            ? `\n\n--- POLICIES (STRICT TRUTH) ---\nRefund: ${(setting.policies as any).refund || "N/A"}\nCancellation: ${(setting.policies as any).cancellation || "N/A"}\nGeneral: ${(setting.policies as any).general || "N/A"}`
            : "";
        
        const locations = await Location.find({ ownerId }).lean();
        const locationsInfo = locations.length > 0 
            ? `\n\n--- LOCATIONS / BRANCHES ---\n${locations.map((l: any) => `Name: ${l.name}\nCity: ${l.city}\nAddress: ${l.address || "N/A"}\nPhone: ${l.phone || "N/A"}\nTimings: ${l.timings || "N/A"}\nDetails: ${l.description || "N/A"}`).join("\n\n")}`
            : "";

        const KNOWLEDGE = `Core Info:\n${bizInfo}${faqsInfo}${policiesInfo}${mediaInfo}${overrideInfo}${locationsInfo}\n\nSearch Results:\n${retrievedKnowledge || "No specific matching facts found."}`;

        // --- 5. Complexity Check (Intent + Subject) ---
        const complexIntents = ["services", "complaint", "unknown"];
        const complexKeywords = /\b(why|explain|compare|elaborate|difference|reason|how to|troubleshoot)\b/i;
        const isComplex = complexIntents.includes(intent) || complexKeywords.test(cleanMessage);
        const complexity = isComplex ? "complex" : "medium";
        console.log(`[Chat] Routing: ${complexity} | Intent: ${intent}`);
        // -------------------------------------------------------

        // --- 6. Build Prompt ---
        const bName = setting?.businessName || "us";
        const prompt = `Act as a helpful human support representative for ${bName}. 
NEVER mention that you are an AI or bot. Be polite, warm, and professional.
Use the provided INFO to answer the user's question. 

RULES:
1. If you can answer using ONLY the INFO below, set "canAnswer": true.
2. If the INFO does not contain enough information to answer confidently, DO NOT guess. Instead set "canAnswer": false.
3. Keep the reply short (max 20 words).
4. Output ONLY JSON: {"canAnswer": boolean, "reply": "string"}
5. Never make up information. Never repeat the same reply twice.
${conversationMemory}
INFO:
${KNOWLEDGE}

Q: ${cleanMessage}`;

        console.log(`[Chat] FINAL PROMPT SENT TO AI:\n${prompt}\n-------------------`);

        let reply = "";
        let canAnswer = true;
        let aiSuccess = false;

        // --- 1. Try Gemini (Primary, Smart Routing) ---
        if (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== "your_gemini_api_key_here") {
            const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

            // Smart Routing: complex queries use Pro, medium use Flash
            const modelName = isComplex ? "gemini-1.5-pro" : "gemini-1.5-flash"; 
            const maxTokens = isComplex ? 250 : 120;
            
            try {
                console.log(`[Chat][${complexity}] Trying Gemini: ${modelName}`);
                const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, responseMimeType: "application/json" }
                });
                
                const geminiRes = await model.generateContent(prompt);
                const response = await geminiRes.response;
                const rawReply = response.text();

                if (rawReply) {
                    const usage = (geminiRes as any).usageMetadata;
                    console.log(`[Chat] Gemini success | ${modelName} | Tokens: In=${usage?.promptTokenCount}, Out=${usage?.candidatesTokenCount}, Total=${usage?.totalTokenCount}`);
                    
                    // Log usage to DB
                    logUsage({
                        userId: ownerId,
                        model: modelName,
                        promptTokens: usage?.promptTokenCount || 0,
                        completionTokens: usage?.candidatesTokenCount || 0,
                        type: "chat"
                    });

                    try {
                        let cleaned = rawReply.trim();
                        if (cleaned.startsWith("```")) {
                            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
                        }
                        const parsed = JSON.parse(cleaned);
                        canAnswer = parsed.canAnswer !== false;
                        reply = parsed.reply || "";
                    } catch {
                        canAnswer = false;
                        reply = "";
                    }

                    // Human-like proactive fallback
                    if (!canAnswer || !reply || reply.includes('{"')) {
                        reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                        canAnswer = false;
                    }
                    aiSuccess = true;
                }
            } catch (apiError: unknown) {
                console.error(`[Chat] Gemini model ${modelName} failed:`, (apiError as any)?.message || apiError);
            }
        }

        // --- 2. Fallback to Groq (Fast & Reliable) ---
        if (!aiSuccess && env.GROQ_API_KEY) {
            try {
                console.log(`[Chat][${complexity}] Groq fallback with llama-3.3-70b-versatile`);
                const groq = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
                const completion = await groq.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                    max_tokens: isComplex ? 250 : 120,
                    temperature: 0.7,
                });
                const content = completion.choices[0].message.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    canAnswer = parsed.canAnswer !== false;
                    reply = parsed.reply || "";
                    if (!canAnswer || !reply || reply.includes('{"')) {
                        reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                        canAnswer = false;
                    }
                    aiSuccess = true;
                    console.log(`[Chat] Groq success | Tokens: In=${completion.usage?.prompt_tokens}, Out=${completion.usage?.completion_tokens}`);
                }
            } catch (e) {
                console.error(`[Chat] Groq fallback failed:`, e);
            }
        }

        // --- 3. Fallback to Grok (xAI) ---
        if (!aiSuccess && env.GROK_API_KEY) {
            try {
                console.log(`[Chat][${complexity}] Grok fallback with grok-beta`);
                const grok = new OpenAI({ apiKey: env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" });
                const completion = await grok.chat.completions.create({
                    model: "grok-beta",
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                    max_tokens: isComplex ? 250 : 120,
                    temperature: 0.7,
                });
                const content = completion.choices[0].message.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    canAnswer = parsed.canAnswer !== false;
                    reply = parsed.reply || "";
                    if (!canAnswer || !reply || reply.includes('{"')) {
                        reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                        canAnswer = false;
                    }
                    aiSuccess = true;
                    console.log(`[Chat] Grok success | Tokens: In=${completion.usage?.prompt_tokens}, Out=${completion.usage?.completion_tokens}`);
                }
            } catch (e) {
                console.error(`[Chat] Grok fallback failed:`, e);
            }
        }

        // --- 4. Fallback to OpenAI (Smart Routing) ---
        if (!aiSuccess && env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "your_openai_api_key_here") {
            try {
                // Smart Routing: complex queries use gpt-4o, medium use gpt-4o-mini
                const openaiModel = isComplex ? "gpt-4o" : "gpt-4o-mini";
                const maxTokens = isComplex ? 250 : 120;
                console.log(`[Chat][${complexity}] OpenAI fallback with ${openaiModel}`);
                const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
                const completion = await openai.chat.completions.create({
                    model: openaiModel,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                    max_tokens: maxTokens,
                    temperature: 0.7,
                });

                const content = completion.choices[0].message.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    canAnswer = parsed.canAnswer !== false;
                    reply = parsed.reply || "";
                    if (!canAnswer || !reply || reply.includes('{"')) {
                        reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                        canAnswer = false;
                    }
                    aiSuccess = true;
                    const usage = completion.usage;
                    console.log(`[Chat] OpenAI success | Tokens: In=${usage?.prompt_tokens}, Out=${usage?.completion_tokens}, Total=${usage?.total_tokens}`);

                    // Log usage to DB
                    logUsage({
                        userId: ownerId,
                        model: openaiModel,
                        promptTokens: usage?.prompt_tokens || 0,
                        completionTokens: usage?.completion_tokens || 0,
                        type: "chat"
                    });
                }
            } catch (openaiError: unknown) {
                console.error(`[Chat] OpenAI fallback failed:`, (openaiError as any)?.message || openaiError);
            }
        }

        if (!aiSuccess) {
            console.error("[Chat] All AI models (Gemini & OpenAI) failed for owner:", ownerId);
            return NextResponse.json(
                { message: "The AI service is temporarily overloaded. Please try again in 1-2 minutes." },
                { status: 503 }
            );
        }

        // If the AI couldn't answer, store with smart grouping & frequency tracking
        if (!canAnswer) {
            try {
                const SIMILARITY_THRESHOLD = 0.92;
                let matchedGroup: string | undefined;

                if (queryEmbedding) {
                    const existingUnanswered = await UnansweredQuestion.find({
                        ownerId,
                        status: "unanswered",
                        embedding: { $exists: true, $not: { $size: 0 } }
                    }).lean();

                    for (const existing of existingUnanswered) {
                        if (existing.embedding && existing.embedding.length > 0) {
                            const sim = cosineSimilarity(queryEmbedding, existing.embedding);
                            if (sim > SIMILARITY_THRESHOLD) {
                                matchedGroup = existing.similarGroup || existing._id.toString();
                                await UnansweredQuestion.updateOne(
                                    { _id: existing._id },
                                    { $inc: { frequency: 1 }, $set: { similarGroup: matchedGroup } }
                                );
                                console.log(`[UQ] Grouped similar question (sim=${sim.toFixed(3)}) | freq++ for "${existing.question}"`);
                                break;
                            }
                        }
                    }
                }

                if (!matchedGroup) {
                    const newDoc = await UnansweredQuestion.create({
                        ownerId,
                        question: message,
                        source: "widget",
                        status: "unanswered",
                        frequency: 1,
                        category: intent,
                        embedding: queryEmbedding || [],
                    });
                    await UnansweredQuestion.updateOne(
                        { _id: newDoc._id },
                        { $set: { similarGroup: newDoc._id.toString() } }
                    );
                    console.log(`[UQ] New unanswered question stored | category: ${intent}`);
                }
            } catch (dbErr) {
                console.error("[Chat] Failed to store unanswered question:", dbErr);
            }
        }

        // Save to cache using the normalized cleanMessage as the key for max hit rate
        // Also save the intent bucket for canonical answers
        if (canAnswer && reply) {
            setCachedReply(ownerId, cleanMessage, reply, queryEmbedding, intent).catch(() => {});
        }

        const response = NextResponse.json(reply)
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        return response

    } catch (error) {
        console.error("Chat API error:", error);
        const errResponse = NextResponse.json(
            { message: "An internal server error occurred processing the chat." },
            { status: 500 }
        )
        errResponse.headers.set("Access-Control-Allow-Origin", "*");
        errResponse.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        errResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");
        return errResponse
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
    })
}