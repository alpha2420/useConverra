import KnowledgeChunk from "@backend/models/knowledge.model";
import { rankAndFilterChunks } from "@shared/lib/embeddings";

export class RAGService {
    static async retrieve(
        ownerId: string, 
        cleanMessage: string, 
        queryEmbedding: number[] | undefined, 
        intent: string, 
        hardcodedIntent: string | null
    ): Promise<{ retrievedKnowledge: string, directAnswer?: string }> {
        let retrievedKnowledge = "";

        if (!queryEmbedding) {
            return { retrievedKnowledge };
        }

        try {
            const chunks = await KnowledgeChunk.aggregate([
                {
                    $vectorSearch: {
                        index: "vector_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: 100,
                        limit: 20,
                        filter: { ownerId: ownerId }
                    }
                },
                {
                    $project: {
                        chunkText: 1,
                        embedding: 1,
                        intent: 1,
                        priority: 1,
                        score: { $meta: "vectorSearchScore" }
                    }
                }
            ]);

            console.log(`[RAGService] Retrieved ${chunks.length} chunks via Atlas $vectorSearch for ownerId: "${ownerId}"`);

            if (chunks.length > 0) {
                const scored = chunks.map(c => {
                    let score = c.score;
                    if (c.intent && (c.intent === hardcodedIntent || c.intent === intent)) {
                        score += 0.15;
                    }
                    if (c.priority === "high") {
                        score += 0.05;
                    }
                    
                    return { text: c.chunkText, embedding: c.embedding, score };
                });

                const refined = rankAndFilterChunks(cleanMessage, scored, 3, 1200);
                
                if (refined.length > 0) {
                    const topChunk = scored.find(s => s.text === refined[0]);
                    if (topChunk && topChunk.score > 0.90 && topChunk.text.includes("A:")) {
                        const directAnswer = topChunk.text.split("A:")[1]?.trim();
                        if (directAnswer) {
                            console.log(`[RAGService] Zero-LLM hit. Score: ${topChunk.score.toFixed(3)} — skipping AI entirely.`);
                            return { retrievedKnowledge: "", directAnswer };
                        }
                    }
                    retrievedKnowledge = refined.join("\n---\n");
                }
            }
        } catch (ragErr) {
            console.error("[RAGService] Retrieval error:", ragErr);
        }

        return { retrievedKnowledge };
    }
}
