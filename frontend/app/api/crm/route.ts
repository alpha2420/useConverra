import { NextRequest, NextResponse } from "next/server";
import connectDb from "@shared/lib/db";
import Conversation from "@backend/models/conversation.model";
import Lead from "@backend/models/lead.model";
import PendingMessage from "@backend/models/pending-message.model";
import { getSession } from "@shared/lib/getSession";

// ─── GET /api/crm — Contacts list + stats ────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const ownerId = session.user.id;

        await connectDb();

        const { searchParams } = new URL(req.url);
        const stage = searchParams.get("stage");
        const leadScore = searchParams.get("leadScore");
        const contactNumber = searchParams.get("contactNumber"); // fetch single convo with messages

        // ── Single conversation with full messages ─────────────────────────
        if (contactNumber) {
            const lead = await Lead.findOne({ ownerId, contactNumber }).lean();
            const convo = await Conversation.findOne({ ownerId, contactNumber }).lean();
            if (!lead && !convo) return NextResponse.json({ message: "Not found" }, { status: 404 });
            
            // Merge lead CRM data with conversation chat data for frontend compatibility
            return NextResponse.json({ 
                ...lead, 
                ...convo, 
                messages: convo?.messages || [] 
            });
        }

        // ── Contacts list ──────────────────────────────────────────────────
        const filter: Record<string, any> = { ownerId };
        if (stage) filter.stage = stage;
        if (leadScore) filter.leadScore = leadScore;

        const contacts = await Lead.find(filter)
            .sort({ lastContactAt: -1 })
            .limit(100)
            .lean();

        // Stats
        const [total, hot, warm, cold, won, newLeads] = await Promise.all([
            Lead.countDocuments({ ownerId }),
            Lead.countDocuments({ ownerId, leadScore: "hot" }),
            Lead.countDocuments({ ownerId, leadScore: "warm" }),
            Lead.countDocuments({ ownerId, leadScore: "cold" }),
            Lead.countDocuments({ ownerId, stage: "won" }),
            Lead.countDocuments({ ownerId, stage: "new" }),
        ]);

        return NextResponse.json({
            contacts,
            stats: { total, hot, warm, cold, won, newLeads },
        });
    } catch (error) {
        console.error("[CRM GET]", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

// ─── PATCH /api/crm — Update stage, notes, tags, isAiPaused ─────────────────
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const ownerId = session.user.id;

        await connectDb();

        const body = await req.json();
        const { contactNumber, stage, notes, tags, isAiPaused } = body;

        if (!contactNumber) {
            return NextResponse.json({ message: "contactNumber is required" }, { status: 400 });
        }

        const leadUpdates: Record<string, any> = {};
        if (stage !== undefined) leadUpdates.stage = stage;
        if (notes !== undefined) leadUpdates.notes = notes;
        if (tags !== undefined) leadUpdates.tags = tags;
        
        const convoUpdates: Record<string, any> = {};
        if (isAiPaused !== undefined) convoUpdates.isAiPaused = isAiPaused;

        let updatedLead = null;
        if (Object.keys(leadUpdates).length > 0) {
            updatedLead = await Lead.findOneAndUpdate(
                { ownerId, contactNumber },
                { $set: leadUpdates },
                { new: true }
            ).lean();
        }

        let updatedConvo = null;
        if (Object.keys(convoUpdates).length > 0) {
            updatedConvo = await Conversation.findOneAndUpdate(
                { ownerId, contactNumber },
                { $set: convoUpdates },
                { new: true }
            ).select("-messages").lean();
        }

        if (!updatedLead && !updatedConvo) return NextResponse.json({ message: "Contact not found" }, { status: 404 });

        return NextResponse.json({ ...updatedLead, ...updatedConvo });
    } catch (error) {
        console.error("[CRM PATCH]", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

// ─── POST /api/crm — Queue an outbound message ───────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const ownerId = session.user.id;

        await connectDb();

        const { contactNumber, text } = await req.json();
        if (!contactNumber || !text) {
            return NextResponse.json({ message: "contactNumber and text are required" }, { status: 400 });
        }

        const pending = await PendingMessage.create({
            ownerId,
            to: contactNumber,
            text,
            status: "pending",
        });

        return NextResponse.json({ message: "Message queued", id: pending._id }, { status: 201 });
    } catch (error) {
        console.error("[CRM POST]", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
