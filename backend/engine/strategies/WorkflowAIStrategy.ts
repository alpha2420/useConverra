import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "@shared/lib/env";

export class WorkflowAIStrategy {
    private static genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || "");

    /**
     * Evaluates a plain-English rule against the trigger data using Gemini Structured Outputs.
     */
    static async evaluateCondition(rule: string, triggerData: any): Promise<boolean> {
        if (!env.GEMINI_API_KEY) {
            console.error("[WorkflowAIStrategy] Missing GEMINI_API_KEY");
            return false;
        }

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                temperature: 0.1, // Low temperature for deterministic true/false evaluation
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        isMatch: {
                            type: SchemaType.BOOLEAN,
                            description: "True if the trigger data satisfies the plain-English rule, false otherwise."
                        },
                        reasoning: {
                            type: SchemaType.STRING,
                            description: "A short, one-sentence explanation for the decision."
                        }
                    },
                    required: ["isMatch", "reasoning"],
                },
            }
        });

        const prompt = `
You are a deterministic workflow engine evaluation node.
Your task is to evaluate if the provided EVENT DATA satisfies the USER RULE.

USER RULE: "${rule}"

EVENT DATA:
${JSON.stringify(triggerData, null, 2)}

Return a strict JSON response evaluating this.
`;

        try {
            console.log(`[WorkflowAIStrategy] Evaluating Rule: "${rule}"`);
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            const parsed = JSON.parse(responseText);
            console.log(`[WorkflowAIStrategy] Result: ${parsed.isMatch} (${parsed.reasoning})`);
            
            return parsed.isMatch === true;
        } catch (error: any) {
            console.error(`[WorkflowAIStrategy] Evaluation failed:`, error?.message || error);
            return false; // Fail-safe
        }
    }
}
