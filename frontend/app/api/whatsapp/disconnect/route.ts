import { NextRequest, NextResponse } from "next/server";
import { disconnectWhatsApp } from "@backend/services/whatsapp";
import { getSession } from "@shared/lib/getSession";

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

        // Prevent user from disconnecting another user's WhatsApp
        if (session.user.id !== ownerId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await disconnectWhatsApp(ownerId);
        
        return NextResponse.json({ success: true, message: "WhatsApp session cleared." });
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message || "Failed to disconnect" }, { status: 500 });
    }
}
