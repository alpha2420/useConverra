import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { IMessage } from "../models/conversation.model";
import { clearProviderError, reportProviderError } from "./providerError";
 
export interface ConversationAnalysis {
    // Existing
    intent: "buying" | "inquiry" | "complaint" | "spam" | "unknown";
    urgency: "high" | "medium" | "low";
    leadScore: "hot" | "warm" | "cold";
    extractedName: string | null;
    extractedBudget: string | null;
    summary: string;
    sentiment: "positive" | "neutral" | "negative";
    // Next Best Action
    nextBestAction: string;
    nextBestActionType: "follow_up" | "send_pricing" | "close" | "nurture" | "escalate" | "none";
    // Enriched Records
    enriched: {
        company: string | null;
        location: string | null;
        email: string | null;
        language: string | null;
    };
}
 
export async function analyzeConversation(
    messages: IMessage[],
    ownerId?: string
): Promise<ConversationAnalysis | null> {
    if (!messages || messages.length === 0) return null;
 
    const recent = messages.slice(-6);
    const transcript = recent
        .map((m) => `${m.role === "customer" ? "C" : m.role === "owner" ? "S" : "B"}: ${m.text}`)
        .join("\n");
 
    const prompt = `Analyze this WhatsApp sales chat. Reply ONLY valid JSON, no markdown:
{"intent":"buying|inquiry|complaint|spam|unknown","urgency":"high|medium|low","leadScore":"hot|warm|cold","extractedName":"Real person name only (set null if it's a business name or greeting)","extractedBudget":"budget or null","summary":"1 sentence","sentiment":"positive|neutral|negative","nextBestAction":"short action","nextBestActionType":"follow_up|send_pricing|close|nurture|escalate|none","enriched":{"company":null,"location":null,"email":null,"language":"English"}}

CHAT (B=Bot/Business, C=Customer):
${transcript}`;
 
    // 1. Try Gemini (Primary)
    if (process.env.GEMINI_API_KEY) {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash",
                generationConfig: { maxOutputTokens: 300 }
            });

            const res = await model.generateContent(prompt);
            const responseText = res.response.text();

            if (responseText) {
                let cleaned = responseText.trim();
                if (cleaned.startsWith("```")) {
                    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
                }
                if (ownerId) await clearProviderError(ownerId, 'gemini');
                console.log("[Analyze] Gemini success (Primary)");
                return JSON.parse(cleaned) as ConversationAnalysis;
            }
        } catch (e: any) {
            console.error("[Analyze] Gemini failed:", e);
            if (ownerId) await reportProviderError(ownerId, 'gemini', e);
        }
    }

    // 2. Try OpenAI (Fallback 1)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_openai_api_key_here") {
        try {
            const openai = new OpenAI({ apiKey: openaiKey });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 300,
            });
            const content = completion.choices[0].message.content;
            if (content) {
                if (ownerId) await clearProviderError(ownerId, 'openai');
                console.log("[Analyze] OpenAI success (Fallback)");
                return JSON.parse(content) as ConversationAnalysis;
            }
        } catch (e: any) {
            console.error("[Analyze] OpenAI failed:", e);
            if (ownerId) await reportProviderError(ownerId, 'openai', e);
        }
    }

    // 3. Try Grok (Fallback 2)
    const grokKey = process.env.GROK_API_KEY;
    if (grokKey) {
        try {
            const grok = new OpenAI({ apiKey: grokKey, baseURL: "https://api.x.ai/v1" });
            const completion = await grok.chat.completions.create({
                model: "grok-2-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 300,
            });
            const content = completion.choices[0].message.content;
            if (content) {
                if (ownerId) await clearProviderError(ownerId, 'grok');
                console.log("[Analyze] Grok success (Fallback)");
                return JSON.parse(content) as ConversationAnalysis;
            }
        } catch (e: any) {
            console.error("[Analyze] Grok failed:", e);
            if (ownerId) await reportProviderError(ownerId, 'grok', e);
        }
    }

    // 4. Try Groq (Fallback 3)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            const groq = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 300,
            });
            const content = completion.choices[0].message.content;
            if (content) {
                if (ownerId) await clearProviderError(ownerId, 'groq');
                console.log("[Analyze] Groq success (Fallback)");
                return JSON.parse(content) as ConversationAnalysis;
            }
        } catch (e: any) {
            console.error("[Analyze] Groq failed:", e);
            if (ownerId) await reportProviderError(ownerId, 'groq', e);
        }
    }
 
    return null;
}
