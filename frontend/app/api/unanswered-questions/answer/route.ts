import connectDb from "@shared/lib/db";
import UnansweredQuestion from "@backend/models/unanswered-question.model";
import Settings from "@backend/models/settings.model";
import PendingMessage from "@backend/models/pending-message.model";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { questionId, ownerId, answer } = await req.json();

        if (!questionId || !ownerId || !answer) {
            return NextResponse.json(
                { message: "questionId, ownerId, and answer are required" },
                { status: 400 }
            );
        }

        // Prevent writing to another user's knowledge base
        if (session.user.id !== ownerId) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        await connectDb();

        // Update the question record
        const question = await UnansweredQuestion.findByIdAndUpdate(
            questionId,
            { status: "answered", answer },
            { new: true }
        );

        if (!question) {
            return NextResponse.json(
                { message: "Question not found" },
                { status: 404 }
            );
        }

        // Append Q&A to the knowledge base
        const qaPair = `\n\nQ: ${question.question}\nA: ${answer}`;
        
        let updatedSettings = await Settings.findOne({ ownerId });
        if (!updatedSettings) {
            updatedSettings = new Settings({ ownerId, knowledge: "" });
        }
        
        updatedSettings.knowledge = (updatedSettings.knowledge || "") + qaPair;
        await updatedSettings.save();

        // Re-index RAG chunks so the new answer is immediately searchable
        try {
            const KnowledgeChunk = (await import("@backend/models/knowledge.model")).default;
            const { getEmbedding, chunkText } = await import("@shared/lib/embeddings");
            const newChunks = chunkText(qaPair, 500);
            const chunkDocs = await Promise.all(
                newChunks.map(async (text) => {
                    try {
                        const embedding = await getEmbedding(text);
                        return { ownerId, chunkText: text, embedding };
                    } catch { return null; }
                })
            );
            const valid = chunkDocs.filter(c => c !== null);
            if (valid.length > 0) {
                await KnowledgeChunk.insertMany(valid);
                console.log(`[RAG] Re-indexed ${valid.length} new chunk(s) after answer submission.`);
            }
        } catch (ragErr) {
            console.error("[RAG] Re-index error after answer:", ragErr);
        }

        // Direct Reply: If from WhatsApp, send the answer back immediately
        if (question.source === "whatsapp" && question.contactNumber) {
            try {
                await PendingMessage.create({
                    ownerId,
                    to: question.contactNumber,
                    text: answer,
                    status: "pending"
                });
                console.log(`[Reply] Queued WhatsApp reply to ${question.contactNumber}`);
            } catch (replyErr) {
                console.error("[Reply] Failed to queue WhatsApp reply:", replyErr);
            }
        }

        return NextResponse.json({
            question,
            updatedKnowledge: updatedSettings?.knowledge || ""
        });
    } catch (error) {
        return NextResponse.json(
            { message: `Error answering question: ${error}` },
            { status: 500 }
        );
    }
}
