import { getEmbedding } from "@shared/lib/embeddings";
import { classifyIntent, getIntentReply } from "@shared/lib/intentClassifier";
import { matchHardcodedIntent } from "@shared/lib/hardcodedRules";
import Location from "@backend/models/location.model";
import KnowledgeChunk from "@backend/models/knowledge.model";
import { MemoryService } from "./MemoryService";
import { RAGService } from "./RAGService";
import { PromptBuilderService } from "./PromptBuilderService";
import { UnansweredQuestionService } from "./UnansweredQuestionService";
import { LLMFactory } from "../llm/LLMFactory";
import { RedisService } from "./RedisService";
import { ToolRouter } from "../tools/ToolRouter";
import { GeminiStrategy } from "../llm/strategies/GeminiStrategy";

export class ChatPipelineService {
    static async executeChat(
        ownerId: string,
        message: string,
        history: any[],
        setting: any
    ): Promise<string | { error: string, status: number }> {
        
        // 1. Memory & Preprocessing
        const conversationMemory = await MemoryService.formatMemory(history, null, ownerId);
        const cleanMessage = PromptBuilderService.cleanMessage(message);
        console.log(`[Pipeline] Raw: "${message}" → Clean: "${cleanMessage}"`);

        // Guard: empty or whitespace-only messages
        if (!cleanMessage || cleanMessage.trim().length === 0) {
            return "I didn't quite catch that. Could you please rephrase your question? 😊";
        }

        // 2. Greetings & Overrides
        const greetingPattern = /^\s*(hello|hi|hey|hiya|howdy|greetings|sup|what'?s up|good (morning|afternoon|evening))\s*[!.?]?\s*$/i;
        if (greetingPattern.test(message)) {
            const businessName = setting.businessName || "us";
            return `Hello! 👋 Welcome to ${businessName}. How can I help you today?`;
        }

        if (setting.aiOverrides && setting.aiOverrides.length > 0) {
            const cleanMsg = message.toLowerCase().trim();
            const override = setting.aiOverrides.find((o: any) => cleanMsg.includes(o.topic.toLowerCase().trim()));
            if (override) {
                console.log(`[Pipeline] Override hit for topic: "${override.topic}"`);
                return override.response;
            }
        }

        // 3. Hardcoded Rules (Elite 50)
        const hardcodedIntent = matchHardcodedIntent(cleanMessage);
        if (hardcodedIntent) {
            const directChunk = await KnowledgeChunk.findOne({ 
                ownerId, intent: hardcodedIntent, priority: "high"
            }).lean();
            if (directChunk && directChunk.chunkText.includes("A:")) {
                const answer = directChunk.chunkText.split("A:")[1]?.trim();
                if (answer) return answer;
            }
        }

        // 4. Intent Classification
        const intent = classifyIntent(cleanMessage);
        const intentReply = getIntentReply(intent, {
            businessName: setting.businessName,
            supportEmail: setting.supportEmail,
            whatsappNumber: setting.whatsappNumber,
            knowledge: setting.knowledge || "",
        });

        if (intentReply !== null) {
            console.log(`[Pipeline] Intent fast-return: "${intent}"`);
            return intentReply;
        }

        // 5. Redis Cache Check (Lightning Fast FAQs)
        // We only check cache for standalone queries (empty history) to avoid serving wrong contextual answers.
        if (history.length === 0) {
            const cached = await RedisService.getCachedResponse(ownerId, cleanMessage);
            if (cached) return cached;
        }

        // 6. Embedding Generation
        let queryEmbedding: number[] | undefined;
        try {
            queryEmbedding = await getEmbedding(cleanMessage);
        } catch (err) {
            console.error("[Pipeline] Embedding generation failed:", err);
        }

        // 7. RAG
        const { retrievedKnowledge, directAnswer } = await RAGService.retrieve(ownerId, cleanMessage, queryEmbedding, intent, hardcodedIntent);
        if (directAnswer) return directAnswer;

        // 8. Prompt Building
        const locations = await Location.find({ ownerId }).lean();
        const prompt = PromptBuilderService.build(setting, locations, retrievedKnowledge, conversationMemory, cleanMessage);

        // 9. LLM Generation
        const complexIntents = ["services", "complaint", "unknown"];
        const complexKeywords = /\b(why|explain|compare|elaborate|difference|reason|how to|troubleshoot)\b/i;
        const isComplex = complexIntents.includes(intent) || complexKeywords.test(cleanMessage);

        // Try Gemini or fallback to whatever factory produces
        let strategy = LLMFactory.getStrategy(); // Will auto-select based on env
        if (!strategy) {
             return { error: "The AI service is temporarily overloaded. Please try again in 1-2 minutes.", status: 503 };
        }

        let result = await strategy.generate(prompt, { isComplex, ownerId });
        
        // Strategy Fallback: ONLY trigger if Gemini had a TECHNICAL failure (returned null).
        // canAnswer=false means Gemini understood but the business can't answer — that is correct, do NOT retry.
        if (result === null) {
            console.log(`[Pipeline] Gemini technical failure — trying OpenAI fallback.`);
            const fallbackStrategy = LLMFactory.getStrategy("openai");
            if (fallbackStrategy) {
                result = await fallbackStrategy.generate(prompt, { isComplex, ownerId });
            }
        }

        if (!result) {
            return { error: "The AI service is temporarily overloaded. Please try again in 1-2 minutes.", status: 503 };
        }

        // 9.5. Tool Calling (AI Agent Layer)
        // If Gemini is available, we try the tool-aware pipeline.
        // If the AI decides to call a tool, we execute it and skip to final reply.
        try {
            const geminiStrategy = LLMFactory.getStrategy("gemini");
            if (geminiStrategy instanceof GeminiStrategy) {
                const toolRouter = ToolRouter.getInstance();
                const toolResult = await geminiStrategy.generateWithTools(
                    prompt,
                    toolRouter.getToolDefinitions(),
                    ownerId
                );

                if (toolResult?.type === "tool_call") {
                    // Execute the requested tool and return its result directly
                    const toolOutput = await toolRouter.execute(ownerId, toolResult.name, toolResult.args);
                    console.log(`[Pipeline] Tool "${toolResult.name}" executed. Output: ${toolOutput}`);
                    return toolOutput;
                }
                // If it returned text via tool-aware call, use that
                if (toolResult?.type === "text") {
                    result = { canAnswer: toolResult.canAnswer, reply: toolResult.reply };
                }
            }
        } catch (toolErr) {
            // Graceful degradation: if tool layer fails, fall through to normal result
            console.error("[Pipeline] Tool layer error — using standard LLM result:", toolErr);
        }

        // 10. Post-processing
        if (!result.canAnswer) {
            // Log for human follow-up
            UnansweredQuestionService.logUnanswered(ownerId, message, intent, queryEmbedding).catch(() => {});
        } else if (history.length === 0) {
            // 11. Save confident answers to Redis cache
            RedisService.setCachedResponse(ownerId, cleanMessage, result.reply).catch(() => {});
        }

        return result.reply;
    }
}
