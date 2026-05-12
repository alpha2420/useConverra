import OpenAI from "openai";
import { env } from "@shared/lib/env";
import { logUsage } from "@shared/lib/usage";
import { LLMStrategy, LLMResponse } from "../LLMStrategy";

export class OpenAIStrategy implements LLMStrategy {
    private openai: OpenAI;

    constructor() {
        if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === "your_openai_api_key_here") {
            throw new Error("OpenAI API key is missing or invalid");
        }
        this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }

    async generate(prompt: string, options?: { isComplex?: boolean, ownerId?: string }): Promise<LLMResponse | null> {
        const isComplex = options?.isComplex || false;
        const ownerId = options?.ownerId;
        const openaiModel = isComplex ? "gpt-4o" : "gpt-4o-mini";
        const maxTokens = isComplex ? 250 : 120;

        try {
            console.log(`[OpenAIStrategy][${isComplex ? 'complex' : 'medium'}] OpenAI fallback with ${openaiModel}`);
            const completion = await this.openai.chat.completions.create({
                model: openaiModel,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: maxTokens,
                temperature: 0.7,
            });

            const content = completion.choices[0].message.content;
            if (!content) return null;

            const usage = completion.usage;
            console.log(`[OpenAIStrategy] OpenAI success | Tokens: In=${usage?.prompt_tokens}, Out=${usage?.completion_tokens}, Total=${usage?.total_tokens}`);

            if (ownerId) {
                logUsage({
                    userId: ownerId,
                    model: openaiModel,
                    promptTokens: usage?.prompt_tokens || 0,
                    completionTokens: usage?.completion_tokens || 0,
                    type: "chat"
                });
            }

            return this.parseResponse(content);
        } catch (error: any) {
            console.error(`[OpenAIStrategy] OpenAI fallback failed:`, error?.message || error);
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
