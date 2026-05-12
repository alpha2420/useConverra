export type HistoryEntry = { role: string; parts?: { text: string }[]; content?: string };

export class MemoryService {
    static formatMemory(history: any): string {
        const recentHistory: HistoryEntry[] = Array.isArray(history) ? history.slice(-5) : [];
        const conversationMemory = recentHistory
            .map((h: HistoryEntry) => {
                const text = h.parts?.[0]?.text || h.content || "";
                const role = h.role === "user" ? "Customer" : "Assistant";
                return text ? `${role}: ${text.slice(0, 200)}` : null;
            })
            .filter(Boolean)
            .join("\n");
        
        return conversationMemory || "No prior conversation.";
    }
}
