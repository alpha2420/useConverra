import UnansweredQuestion from "@backend/models/unanswered-question.model";
import { cosineSimilarity } from "@shared/lib/embeddings";

export class UnansweredQuestionService {
    static async logUnanswered(
        ownerId: string, 
        message: string, 
        intent: string, 
        queryEmbedding?: number[]
    ) {
        try {
            const SIMILARITY_THRESHOLD = 0.92;
            let matchedGroup: string | undefined;

            if (queryEmbedding && queryEmbedding.length > 0) {
                const existingUnanswered = await UnansweredQuestion.find({
                    ownerId,
                    status: "unanswered",
                    embedding: { $exists: true, $not: { $size: 0 } }
                }).lean();

                for (const existing of existingUnanswered) {
                    if (existing.embedding && existing.embedding.length > 0) {
                        const sim = cosineSimilarity(queryEmbedding, existing.embedding);
                        if (sim > SIMILARITY_THRESHOLD) {
                            matchedGroup = existing.similarGroup || existing._id.toString();
                            await UnansweredQuestion.updateOne(
                                { _id: existing._id },
                                { $inc: { frequency: 1 }, $set: { similarGroup: matchedGroup } }
                            );
                            console.log(`[UQService] Grouped similar question (sim=${sim.toFixed(3)}) | freq++ for "${existing.question}"`);
                            break;
                        }
                    }
                }
            }

            if (!matchedGroup) {
                const newDoc = await UnansweredQuestion.create({
                    ownerId,
                    question: message,
                    source: "widget",
                    status: "unanswered",
                    frequency: 1,
                    category: intent,
                    embedding: queryEmbedding || [],
                });
                await UnansweredQuestion.updateOne(
                    { _id: newDoc._id },
                    { $set: { similarGroup: newDoc._id.toString() } }
                );
                console.log(`[UQService] New unanswered question stored | category: ${intent}`);
            }
        } catch (dbErr) {
            console.error("[UQService] Failed to store unanswered question:", dbErr);
        }
    }
}
