import AICorrection from "../models/ai-correction.model";

export type HistoryEntry = { role: string; parts?: { text: string }[]; content?: string };

export class MemoryService {
    /**
     * Builds a lean, high-value memory block.
     * Merged logic from buildMemoryContext.ts to include:
     * - Name, budget, and preferences
     * - Smart windowing (last 5 messages)
     * - Owner corrections (learned behavior)
     */
    static async formatMemory(history: any, conversation: any, ownerId: string): Promise<string> {
        const parts: string[] = [];

        // 1. Structured Contact Facts
        if (conversation) {
            const contactMemory: string[] = [];
            if (conversation.extractedName) contactMemory.push(`Name: ${conversation.extractedName}`);
            if (conversation.extractedBudget) contactMemory.push(`Budget: ${conversation.extractedBudget}`);
            if (conversation.notes) contactMemory.push(`Open issue: ${conversation.notes}`);
            
            if (contactMemory.length > 0) {
                parts.push(`CUSTOMER: ${contactMemory.join(" | ")}`);
            }
        }

        // 2. Conversation History (Last 5 messages)
        const recentHistory: HistoryEntry[] = Array.isArray(history) ? history.slice(-5) : [];
        const historyLines = recentHistory
            .map((h: HistoryEntry) => {
                const text = h.parts?.[0]?.text || h.content || "";
                const role = h.role === "user" ? "Customer" : "Assistant";
                return text ? `${role}: ${text.slice(0, 200)}` : null;
            })
            .filter(Boolean);

        if (historyLines.length > 0) {
            parts.push(`RECENT MESSAGES:\n${historyLines.join("\n")}`);
        }

        // 3. Owner Corrections (Learned from past mistakes)
        try {
            const corrections = await AICorrection.find({ ownerId })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            if (corrections && corrections.length > 0) {
                const correctionLines = corrections.map(
                    (c: any) => `Q: "${c.originalQuestion}" → Correct Answer: "${c.correctReply}"`
                );
                parts.push(`LEARNED CORRECTIONS (do NOT repeat these past mistakes):\n${correctionLines.join("\n")}`);
            }
        } catch (e) {
            console.warn("[Memory] Could not load corrections:", e);
        }

        return parts.join("\n") || "No prior conversation.";
    }
}
