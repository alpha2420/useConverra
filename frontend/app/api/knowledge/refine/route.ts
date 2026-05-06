import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { env } from "@shared/lib/env";
import { getSession } from "@shared/lib/getSession";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { text } = await req.json();
        if (!text || text.trim().length < 10) {
            return NextResponse.json({ message: "Text is too short to refine." }, { status: 400 });
        }

        if (!env.GEMINI_API_KEY) {
            return NextResponse.json({ message: "Gemini API key is not configured." }, { status: 500 });
        }

        const prompt = `You are an expert at structuring business knowledge for high-precision RAG systems.
TASK: Convert the following unstructured text into an ELITE structured Q&A format.

RULES:
1. One chunk = One Question -> One Answer.
2. Structure EACH entry EXACTLY like this:
   CATEGORY: [One of: pricing, location, services, payments, refund, contact, onboarding, technical, comparison, edge_cases]
   INTENT: [specific_intent_slug]
   ALIASES: [comma, separated, synonyms, or, ways, users, ask]
   Q: [The Question]
   A: [The Direct Answer - concise but complete]
   PRIORITY: [high/medium/low]
   TAGS: [tag1, tag2]
   ---
3. Preserve all specific details (emails, prices, links).
4. Do NOT add any conversational filler.

TEXT TO REFINE:
${text}`;

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro"];
        let refinedText = "";
        let lastError: any = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`[Refine] Trying ${modelName}...`);
                const response = await (ai as any).models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { maxOutputTokens: 2000 }
                });

                // The text property is a getter that might throw or return empty
                if (response?.text) {
                    refinedText = response.text;
                } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    refinedText = response.candidates[0].content.parts[0].text;
                }

                if (refinedText) {
                    console.log(`[Refine] Success with ${modelName}`);
                    break;
                }
            } catch (err: any) {
                lastError = err;
                console.error(`[Refine] ${modelName} failed:`, err?.message || err);
            }
        }

        if (!refinedText) {
            const errorDetail = lastError?.message || lastError || "Unknown AI error";
            throw new Error(`AI generation failed: ${errorDetail}`);
        }

        return NextResponse.json({ refinedText });
    } catch (error: any) {
        console.error("Knowledge Refinement error:", error);
        return NextResponse.json(
            { message: error?.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}
