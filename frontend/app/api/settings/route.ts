import connectDb from "@shared/lib/db";
import Settings from "@backend/models/settings.model";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";

export async function POST(req:NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const {
            ownerId, businessName, businessType, description,
            location, workingHours, website, services,
            supportEmail, whatsappNumber, supportNumber, emergencyContact,
            knowledge, faqs, policies, agentInstructions, mediaLinks, aiOverrides
        } = await req.json()

        if(!ownerId){
            return NextResponse.json(
                {message:"owner id is required"},
                {status:400}
            )
        }

        // Prevent updating data for other users
        if (session.user.id !== ownerId) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

         await connectDb() 
        const settings=await Settings.findOneAndUpdate(
            {ownerId},
            {
                ownerId, businessName, businessType, description,
                location, workingHours, website, services,
                supportEmail, whatsappNumber, supportNumber, emergencyContact,
                knowledge, faqs, policies, agentInstructions, mediaLinks, aiOverrides
            },
            {new:true,upsert:true}
        )

        // --- RAG: Chunk and Embed Knowledge ---
        if (knowledge) {
            try {
                const KnowledgeChunk = (await import("@backend/models/knowledge.model")).default;
                const { getEmbedding, chunkText, parseEliteChunks } = await import("@shared/lib/embeddings");

                // Clear old chunks
                await KnowledgeChunk.deleteMany({ ownerId });

                // Check if it's Elite Structured format or raw text
                const isElite = knowledge.includes("CATEGORY:") && knowledge.includes("Q:");
                const chunks = isElite ? parseEliteChunks(knowledge) : chunkText(knowledge, 400, 50).map(t => ({ text: t }));

                const chunkDocs = await Promise.all(
                    chunks.map(async (item: any) => {
                        try {
                            const embedding = await getEmbedding(item.text);
                            return { 
                                ownerId, 
                                chunkText: item.text, 
                                embedding,
                                category: item.category,
                                intent: item.intent,
                                aliases: item.aliases,
                                priority: item.priority || "medium",
                                tags: item.tags
                            };
                        } catch (err) {
                            console.error("[RAG] Chunk embedding failed:", err);
                            return null;
                        }
                    })
                );

                // Filter out any failed embeddings and save
                const validChunks = chunkDocs.filter(c => c !== null);
                if (validChunks.length > 0) {
                    await KnowledgeChunk.insertMany(validChunks);
                    console.log(`[RAG] Successfully indexed ${validChunks.length} chunks for ${ownerId}`);
                }

                // Clear the Redis AI response cache so the bot uses the NEW knowledge immediately
                const { RedisService } = await import("@backend/services/RedisService");
                await RedisService.invalidateOwnerCache(ownerId);
                console.log(`[Cache] Cleared Redis responses for ${ownerId} due to KB update.`);
            } catch (ragErr) {
                console.error("[RAG] Processing error:", ragErr);
                // We don't return error here to avoid blocking settings save
            }
        }
        // --------------------------------------

        return NextResponse.json(settings)
    } catch (error) {
        console.error("Settings API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred while updating settings." },
            { status: 500 }
        );
    }
}


