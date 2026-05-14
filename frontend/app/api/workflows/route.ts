import connectDb from "@shared/lib/db";
import { Workflow } from "@backend/models/workflow.model";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const ownerId = session.user.id;
        await connectDb();

        const workflows = await Workflow.find({ ownerId }).sort({ createdAt: -1 });
        return NextResponse.json(workflows);
    } catch (error) {
        console.error("Workflows GET API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred." },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const ownerId = session.user.id;
        const body = await req.json();
        
        await connectDb();

        if (body._id) {
            // Update existing workflow
            const updated = await Workflow.findOneAndUpdate(
                { _id: body._id, ownerId },
                {
                    name: body.name,
                    triggerEvent: body.triggerEvent,
                    nodes: body.nodes,
                    isActive: body.isActive
                },
                { new: true }
            );
            return NextResponse.json(updated);
        }

        // Create new workflow
        const newWorkflow = await Workflow.create({
            ownerId,
            businessId: ownerId, // Fallback if businessId is needed
            name: body.name || "Untitled Workflow",
            triggerEvent: body.triggerEvent || "WHATSAPP_MESSAGE",
            nodes: body.nodes || [],
            isActive: true
        });

        return NextResponse.json(newWorkflow);
    } catch (error) {
        console.error("Workflows POST API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred." },
            { status: 500 }
        );
    }
}
