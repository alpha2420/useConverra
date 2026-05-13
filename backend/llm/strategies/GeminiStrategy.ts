import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@shared/lib/env";
import { logUsage } from "@shared/lib/usage";
import { LLMStrategy, LLMResponse } from "../LLMStrategy";

export class GeminiStrategy implements LLMStrategy {
    private genAI: GoogleGenerativeAI;

    constructor() {
        if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY === "your_gemini_api_key_here") {
            throw new Error("Gemini API key is missing or invalid");
        }
        this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }

    async generate(prompt: string, options?: { isComplex?: boolean, ownerId?: string }): Promise<LLMResponse | null> {
        const isComplex = options?.isComplex || false;
        const ownerId = options?.ownerId;
        const modelName = isComplex ? "gemini-2.5-flash" : "gemini-2.0-flash-lite";
        const maxTokens = isComplex ? 250 : 120;

        try {
            console.log(`[GeminiStrategy][${isComplex ? 'complex' : 'medium'}] Trying Gemini: ${modelName}`);
            const model = this.genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7, responseMimeType: "application/json" }
            });
            
            const geminiRes = await model.generateContent(prompt);
            const response = await geminiRes.response;
            const rawReply = response.text();

            if (!rawReply) return null;

            const usage = (geminiRes as any).usageMetadata;
            console.log(`[GeminiStrategy] Gemini success | ${modelName} | Tokens: In=${usage?.promptTokenCount}, Out=${usage?.candidatesTokenCount}, Total=${usage?.totalTokenCount}`);
            
            if (ownerId) {
                logUsage({
                    userId: ownerId,
                    model: modelName,
                    promptTokens: usage?.promptTokenCount || 0,
                    completionTokens: usage?.candidatesTokenCount || 0,
                    type: "chat"
                });
            }

            return this.parseResponse(rawReply);
        } catch (error: any) {
            console.error(`[GeminiStrategy] Gemini model ${modelName} failed:`, error?.message || error);
            return null;
        }
    }

    /**
     * generateWithTools — Sends the prompt to Gemini along with tool definitions.
     * If Gemini decides to call a tool, returns the function call details instead of text.
     * This method is completely isolated and does NOT affect the existing `generate` flow.
     */
    async generateWithTools(prompt: string, toolDefinitions: any[], ownerId?: string): Promise<
        | { type: "text"; reply: string; canAnswer: boolean }
        | { type: "tool_call"; name: string; args: Record<string, any> }
        | null
    > {
        const modelName = "gemini-2.5-flash";
        try {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                tools: [{ functionDeclarations: toolDefinitions }],
                generationConfig: { maxOutputTokens: 300, temperature: 0.5 },
            });

            const geminiRes = await model.generateContent(prompt);
            const response = await geminiRes.response;
            const candidate = response.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            // Check if the AI wants to call a tool
            if (part?.functionCall) {
                console.log(`[GeminiStrategy] Tool call requested: "${part.functionCall.name}"`);
                return {
                    type: "tool_call",
                    name: part.functionCall.name,
                    args: part.functionCall.args as Record<string, any>,
                };
            }

            // Otherwise, it returned plain text — parse it normally
            const rawText = response.text();
            if (!rawText) return null;

            const parsed = this.parseResponse(rawText);
            return { type: "text", ...parsed };
        } catch (error: any) {
            console.error(`[GeminiStrategy] generateWithTools failed:`, error?.message || error);
            return null;
        }
    }

    private parseResponse(rawReply: string): LLMResponse {
        let canAnswer = true;
        let reply = "";
        
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

        if (!canAnswer || !reply || reply.includes('{"')) {
            reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
            canAnswer = false;
        }

        return { canAnswer, reply };
    }
}
