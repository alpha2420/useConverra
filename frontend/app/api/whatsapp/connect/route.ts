import { NextRequest, NextResponse } from "next/server";
import connectDb from "@shared/lib/db";
import WhatsappStatus from "@backend/models/whatsapp-status.model";
import { getSession } from "@shared/lib/getSession";

// Explicitly creates a new WhatsApp session intent in the database.
// This is separate from the polling route so that a reconnect is only triggered
// by a deliberate user action, not automatically on every status poll.
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ownerId } = await req.json();

        if (!ownerId) {
            return NextResponse.json({ error: "Missing ownerId" }, { status: 400 });
        }

        // Prevent user from connecting another user's WhatsApp
        if (session.user.id !== ownerId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDb();

        // Upsert: either create fresh or reset an existing (possibly stale) record
        await WhatsappStatus.findOneAndUpdate(
            { ownerId },
            {
                ownerId,
                isReady: false,
                qrCode: null,
                disconnectRequested: false,
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true, message: "WhatsApp connection initiated." });

    } catch (e: unknown) {
        console.error("WhatsApp Connect Error:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to connect" }, { status: 500 });
    }
}
