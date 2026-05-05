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
 * Splits a long text into smaller chunks for RAG processing.
 * Prioritizes Q&A units and smaller 250-char blocks.
 */
export function chunkText(text: string, chunkSize: number = 300, overlap: number = 50): string[] {
    // 1. If text is already structured as Q&A, split by Q: marker to keep units whole
    if (text.includes("Q:")) {
        return text
            .split(/\n(?=Q:)/)
            .map(t => t.trim())
            .filter(t => t.length > 5);
    }

    // 2. Word-based chunking with overlap
    const chunks: string[] = [];
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length === 0) return chunks;

    let i = 0;
    while (i < words.length) {
        const chunkWords = words.slice(i, i + chunkSize);
        chunks.push(chunkWords.join(" "));
        if (i + chunkSize >= words.length) break;
        i += (chunkSize - overlap);
    }
    
    return chunks;
}

/**
 * High-Precision Reranker (Strict Entity Matching)
 */
export function rankAndFilterChunks(
    query: string,
    chunks: { text: string; embedding: number[]; score: number }[],
    topK: number = 3
): string[] {
    if (!chunks.length) return [];

    const cleanQuery = query.toLowerCase();
    const queryWords = Array.from(new Set(cleanQuery.split(/[\s\-_,.]+/).filter(w => w.length >= 3)));

    const scored = chunks.map(chunk => {
        const text = chunk.text.toLowerCase();
        let keywordBoost = 0;
        let matches = 0;
        
        // Count keyword matches (Strict 20% boost per subject match)
        queryWords.forEach(word => {
            if (text.includes(word)) {
                keywordBoost += 0.20;
                matches++;
            }
        });

        // Specificity boost: Prefer chunks that look like Q&A
        const isQA = (text.includes("q:") || text.includes("a:"));
        const specificityBoost = isQA ? 0.10 : 0;

        // Hard Penalty: If no keywords match and similarity is just "vaguely related", drop it
        const penalty = (matches === 0 && queryWords.length > 0) ? -0.15 : 0;

        const finalScore = chunk.score + keywordBoost + specificityBoost + penalty;
        console.log(`[RAG] Final Score: ${finalScore.toFixed(3)} | Text: ${chunk.text.slice(0, 50)}...`);
        return { ...chunk, finalScore };
    });

    // 1. Sort by augmented score
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // 2. De-duplicate and Strict Filter
    const results: string[] = [];
    const seenFingerprints = new Set<string>();

    for (const item of scored) {
        // Discard low-relevance noise (Threshold adjusted to 0.70 for better natural language matching)
        if (item.finalScore < 0.70) continue;

        const fingerprint = item.text.trim().slice(0, 40).toLowerCase();
        if (seenFingerprints.has(fingerprint)) continue;

        seenFingerprints.add(fingerprint);
        results.push(item.text);

        if (results.length >= topK) break;
    }

    return results;
}
