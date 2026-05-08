import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./env";

/**
 * Generates a vector embedding for the given text using Google's text-embedding-004 model.
 */
export async function getEmbedding(text: string): Promise<number[]> {
    if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }
    
    // text-embedding-004 is the stable, widely available Gemini embedding model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${env.GEMINI_API_KEY}`;
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: { parts: [{ text: text.replace(/\n/g, " ") }] }
            })
        });

        const data = await res.json();
        if (data.error) {
            console.error(`Gemini Embedding API Error: ${data.error.message}`);
            // Fallback to older model if 004 fails
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env.GEMINI_API_KEY}`;
            const fRes = await fetch(fallbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "models/gemini-embedding-001",
                    content: { parts: [{ text: text.replace(/\n/g, " ") }] }
                })
            });
            const fData = await fRes.json();
            if (fData.error) throw new Error(`Gemini Embedding Fallback Error: ${fData.error.message}`);
            return fData.embedding.values;
        }
        
        return data.embedding.values;
    } catch (e) {
        console.error("Embedding fetch failed:", e);
        throw e;
    }
}

/**
 * Calculates the cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EliteChunk {
    text: string;
    category?: string;
    intent?: string;
    aliases?: string[];
    priority?: "high" | "medium" | "low";
    tags?: string[];
}

/**
 * Parses the Elite structured text into individual metadata-rich chunks.
 */
export function parseEliteChunks(text: string): EliteChunk[] {
    const rawChunks = text.split(/---|\n(?=CATEGORY:)/).filter(c => c.trim().length > 10);
    return rawChunks.map(chunk => {
        const lines = chunk.split("\n");
        const find = (key: string) => {
            const line = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase() + ":"));
            return line ? line.split(":")[1]?.trim() : undefined;
        };
        
        // Extract the actual Q&A part for display if needed, but we store the full chunk
        return {
            text: chunk.trim(),
            category: find("CATEGORY"),
            intent: find("INTENT"),
            aliases: find("ALIASES")?.split(",").map(s => s.trim()).filter(Boolean),
            priority: find("PRIORITY")?.toLowerCase() as any,
            tags: find("TAGS")?.split(",").map(s => s.trim()).filter(Boolean)
        };
    });
}

/**
 * Splits long text into high-quality chunks for RAG processing.
 * Upgraded to respect sentence boundaries and deduplicate identical paragraphs.
 * Target size: 400 words (≈500 tokens).
 */
export function chunkText(text: string, targetWords: number = 400, overlapWords: number = 50): string[] {
    // 1. If text is already structured as Q&A, split by Q: marker
    if (text.includes("Q:")) {
        return text
            .split(/\n(?=Q:)/)
            .map(t => t.trim())
            .filter(t => t.length > 5);
    }

    // 2. Split into sentences (rudimentary punctuation split)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    const chunks: string[] = [];
    const seenFingerprints = new Set<string>();
    
    let currentChunk: string[] = [];
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (!sentence) continue;

        const sentenceWords = sentence.split(/\s+/).length;
        
        currentChunk.push(sentence);
        currentWordCount += sentenceWords;

        // If chunk is full, save it and create overlap for the next one
        if (currentWordCount >= targetWords || i === sentences.length - 1) {
            const chunkStr = currentChunk.join(" ").trim();
            
            // Deduplicate: exact matching paragraphs or repeated PDF header/footers
            const fingerprint = chunkStr.slice(0, 100).toLowerCase();
            if (!seenFingerprints.has(fingerprint) && chunkStr.length > 20) {
                seenFingerprints.add(fingerprint);
                chunks.push(chunkStr);
            }

            // Keep the last few sentences for overlap (~50 words)
            currentChunk = [];
            currentWordCount = 0;
            
            // Step back to build overlap if not at the end
            if (i < sentences.length - 1) {
                let overlapCount = 0;
                for (let j = i; j >= 0; j--) {
                    const prevSentence = sentences[j].trim();
                    const words = prevSentence.split(/\s+/).length;
                    if (overlapCount + words > overlapWords) break;
                    currentChunk.unshift(prevSentence);
                    overlapCount += words;
                }
                currentWordCount = overlapCount;
            }
        }
    }
    
    return chunks;
}

/**
 * Source-type priority order for RAG retrieval.
 * FAQs are most reliable → Policies → Products/Services → PDF/general content.
 */
const SOURCE_PRIORITY: Record<string, number> = {
    faq:     4,
    policy:  3,
    service: 2,
    product: 2,
    pdf:     1,
    general: 1,
};

function getSourcePriority(text: string): number {
    const t = text.toLowerCase();
    if (t.startsWith("q:") || t.includes("\na:") || t.includes("faq")) return SOURCE_PRIORITY.faq;
    if (t.includes("refund") || t.includes("cancell") || t.includes("return") || t.includes("policy") || t.includes("delivery") || t.includes("booking rule")) return SOURCE_PRIORITY.policy;
    if (t.includes("service") || t.includes("product") || t.includes("price") || t.includes("price:") || t.includes("duration:")) return SOURCE_PRIORITY.service;
    if (t.includes("[pdf content")) return SOURCE_PRIORITY.pdf;
    return SOURCE_PRIORITY.general;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * High-Precision Reranker with Priority Ordering + Token Budget.
 *
 * Strategy:
 *  1. Score each chunk via cosine similarity + keyword boost + source priority boost.
 *  2. Sort by final score descending.
 *  3. Deduplicate (80-char fingerprint).
 *  4. Return at most topK=3 chunks that together fit within 1200 tokens.
 *  5. Ignore chunks scoring below the relevance threshold.
 */
export function rankAndFilterChunks(
    query: string,
    chunks: { text: string; embedding: number[]; score: number }[],
    topK: number = 3,
    maxTokens: number = 1200
): string[] {
    if (!chunks.length) return [];

    const cleanQuery = query.toLowerCase();
    const queryWords = Array.from(new Set(
        cleanQuery.split(/[\s\-_,.!?]+/).filter(w => w.length >= 3)
    ));

    const scored = chunks.map(chunk => {
        const text = chunk.text.toLowerCase();
        let keywordBoost = 0;
        let matches = 0;

        // Keyword overlap boost (20% per matched word, capped at 60%)
        queryWords.forEach(word => {
            if (text.includes(word)) {
                keywordBoost = Math.min(keywordBoost + 0.20, 0.60);
                matches++;
            }
        });

        // Source-type priority boost (0.05 per priority level above 1)
        const priority = getSourcePriority(chunk.text);
        const priorityBoost = (priority - 1) * 0.05; // FAQ → +0.15, Policy → +0.10, Service → +0.05

        // Penalty if no query words matched and similarity is low
        const penalty = (matches === 0 && queryWords.length > 0) ? -0.15 : 0;

        const finalScore = chunk.score + keywordBoost + priorityBoost + penalty;
        console.log(`[RAG] Score: ${finalScore.toFixed(3)} | Priority: ${priority} | Text: ${chunk.text.slice(0, 50)}...`);

        return { ...chunk, finalScore, sourcePriority: priority };
    });

    // Sort: highest finalScore first; break ties by source priority
    scored.sort((a, b) =>
        b.finalScore !== a.finalScore
            ? b.finalScore - a.finalScore
            : b.sourcePriority - a.sourcePriority
    );

    const results: string[] = [];
    const seenFingerprints = new Set<string>();
    let usedTokens = 0;
    const RELEVANCE_THRESHOLD = 0.70;

    for (const item of scored) {
        if (results.length >= topK) break;

        // Ignore low-relevance noise
        if (item.finalScore < RELEVANCE_THRESHOLD) {
            console.log(`[RAG] Dropped (score ${item.finalScore.toFixed(3)} < ${RELEVANCE_THRESHOLD}): ${item.text.slice(0, 40)}...`);
            continue;
        }

        // Deduplicate (80-char fingerprint)
        const fingerprint = item.text.trim().slice(0, 80).toLowerCase();
        if (seenFingerprints.has(fingerprint)) {
            console.log(`[RAG] Dropped duplicate: ${item.text.slice(0, 40)}...`);
            continue;
        }

        // Token budget check
        const chunkTokens = estimateTokens(item.text);
        if (usedTokens + chunkTokens > maxTokens) {
            console.log(`[RAG] Token budget hit (${usedTokens}/${maxTokens}). Stopping.`);
            break;
        }

        seenFingerprints.add(fingerprint);
        results.push(item.text);
        usedTokens += chunkTokens;
    }

    console.log(`[RAG] Returning ${results.length} chunks (${usedTokens} est. tokens, budget: ${maxTokens}).`);
    return results;
}
