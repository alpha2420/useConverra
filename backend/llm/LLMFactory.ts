import { LLMStrategy } from "./LLMStrategy";
import { GeminiStrategy } from "./strategies/GeminiStrategy";
import { OpenAIStrategy } from "./strategies/OpenAIStrategy";
import { env } from "@shared/lib/env";

export class LLMFactory {
    static getStrategy(provider?: string): LLMStrategy | null {
        try {
            if (provider === "openai") {
                return new OpenAIStrategy();
            } else if (provider === "gemini") {
                return new GeminiStrategy();
            }

            // Default cascading logic if no specific provider is requested
            if (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== "your_gemini_api_key_here") {
                return new GeminiStrategy();
            }
            if (env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "your_openai_api_key_here") {
                return new OpenAIStrategy();
            }
            
            return null;
        } catch (error) {
            console.error("[LLMFactory] Failed to initialize strategy:", error);
            return null;
        }
    }
}
