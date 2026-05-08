import { IConversation } from "../models/conversation.model";
import AICorrection from "../models/ai-correction.model";

/**
 * Builds a lean, high-value memory block for a specific contact.
 *
 * Memory Rules:
 *  - Store ONLY: name, booking info, preferences, unresolved issues.
 *  - Do NOT store every message — keep last 5 only.
 *  - For long conversations (>20 messages), summarize instead of dumping raw history.
 *  - Corrections from the owner are always included (they fix known AI mistakes).
 */
export async function buildMemoryContext(
    conversation: IConversation | null,
    ownerId: string,
    businessName?: string
): Promise<string> {
    if (!conversation) return "";

    const parts: string[] = [];

    // ── 1. High-value structured contact facts (what matters, nothing else) ──
    const contactMemory: string[] = [];

    // Name — only real person names, not business names
    if (conversation.extractedName) {
        if (!businessName || conversation.extractedName.toLowerCase() !== businessName.toLowerCase()) {
            contactMemory.push(`Name: ${conversation.extractedName}`);
        }
    }

    // Booking / Budget / Preferences
    if (conversation.extractedBudget) {
        contactMemory.push(`Budget: ${conversation.extractedBudget}`);
    }
    if (conversation.enriched?.language && conversation.enriched.language !== "English") {
        contactMemory.push(`Preferred language: ${conversation.enriched.language}`);
    }
    if (conversation.enriched?.location) {
        contactMemory.push(`Location: ${conversation.enriched.location}`);
    }
    if (conversation.enriched?.company) {
        contactMemory.push(`Company: ${conversation.enriched.company}`);
    }
    if (conversation.enriched?.email) {
        contactMemory.push(`Email: ${conversation.enriched.email}`);
    }

    // Unresolved issues — captured in owner notes
    if (conversation.notes) {
        contactMemory.push(`Unresolved issue: ${conversation.notes}`);
    }

    // Last known intent (only if non-trivial)
    if (conversation.intent && !["unknown", "greeting"].includes(conversation.intent)) {
        contactMemory.push(`Last intent: ${conversation.intent}`);
    }

    if (contactMemory.length > 0) {
        parts.push(`CUSTOMER: ${contactMemory.join(" | ")}`);
    }

    // ── 2. Conversation history — smart windowing ──────────────────────────
    const totalMessages = conversation.messages.length;
    const LONG_CONVO_THRESHOLD = 20;

    if (totalMessages > LONG_CONVO_THRESHOLD) {
        // Long conversation: don't dump raw history — summarize to a single context line
        const summaryParts: string[] = [`This customer has sent ${totalMessages} messages total.`];
        if (conversation.extractedName) summaryParts.push(`Known as: ${conversation.extractedName}.`);
        if (conversation.intent && conversation.intent !== "unknown") summaryParts.push(`Primary interest: ${conversation.intent}.`);
        if (conversation.notes) summaryParts.push(`Open issue: ${conversation.notes}.`);
        parts.push(`CONVERSATION SUMMARY: ${summaryParts.join(" ")} (Showing last 5 messages only.)`);
    }

    // Always show the last 5 messages regardless of conversation length
    const recentMessages = conversation.messages.slice(-5);
    if (recentMessages.length > 0) {
        const historyLines = recentMessages.map((m) => {
            const role =
                m.role === "customer" ? "Customer" :
                m.role === "owner"    ? "Support"  : "Bot";
            // Trim each message to 150 chars to prevent token bloat
            const text = m.text.length > 150 ? m.text.slice(0, 150) + "…" : m.text;
            return `${role}: ${text}`;
        });
        parts.push(`RECENT MESSAGES:\n${historyLines.join("\n")}`);
    }

    // ── 3. Owner corrections — AI learned from past mistakes ─────────────
    try {
        const corrections = await AICorrection.find({ ownerId })
            .sort({ createdAt: -1 })
            .limit(5)   // Keep to 5 most recent — older corrections are less relevant
            .lean();

        if (corrections.length > 0) {
            const correctionLines = corrections.map(
                (c) => `Q: "${c.originalQuestion}" → Correct Answer: "${c.correctReply}"`
            );
            parts.push(
                `LEARNED CORRECTIONS (do NOT repeat these past mistakes):\n${correctionLines.join("\n")}`
            );
        }
    } catch (e) {
        console.warn("[Memory] Could not load corrections:", e);
    }

    if (parts.length === 0) return "";

    return `[MEMORY]\n${parts.join("\n")}\nUse customer name only if it is a real person's name. Do not ask for info you already have.`;
}
