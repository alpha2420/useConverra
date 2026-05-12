import { NextRequest, NextResponse } from "next/server";
import connectDb from "@shared/lib/db";
import { getSession } from "@shared/lib/getSession";
import { AnalyticsService } from "@backend/services/AnalyticsService";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const ownerId = session.user.id;
 
        await connectDb();
 
        // ── Clean architecture: Logic extracted to AnalyticsService ──
        const stats = await AnalyticsService.getDashboardStats(ownerId);
 
        return NextResponse.json(stats);
    } catch (error) {
        console.error("[Dashboard Stats]", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
