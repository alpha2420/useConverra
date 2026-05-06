import connectDb from "@shared/lib/db";
import UnansweredQuestion from "@backend/models/unanswered-question.model";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        // Always use session ownerId — never trust client-supplied ownerId param
        const ownerId = session.user.id;

        await connectDb();
        const questions = await UnansweredQuestion.find({ ownerId, status: "unanswered" })
            .sort({ createdAt: -1 })
            .limit(100);

        return NextResponse.json(questions);
    } catch (error) {
        console.error("Unanswered questions API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred while fetching questions." },
            { status: 500 }
        );
    }
}
