import connectDb from "@shared/lib/db";
import Location from "@backend/models/location.model";
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

        const locations = await Location.find({ ownerId }).sort({ createdAt: -1 });
        return NextResponse.json(locations);
    } catch (error) {
        console.error("Locations GET API error:", error);
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
        
        // Allow updates via POST if _id is provided
        if (body._id) {
            await connectDb();
            const updatedLocation = await Location.findOneAndUpdate(
                { _id: body._id, ownerId },
                {
                    name: body.name,
                    city: body.city,
                    address: body.address,
                    phone: body.phone,
                    timings: body.timings,
                    description: body.description
                },
                { new: true }
            );
            return NextResponse.json(updatedLocation);
        }

        // Otherwise create new
        if (!body.name || !body.city) {
            return NextResponse.json(
                { message: "Name and City are required" },
                { status: 400 }
            );
        }

        await connectDb();
        const newLocation = await Location.create({
            ownerId,
            name: body.name,
            city: body.city,
            address: body.address,
            phone: body.phone,
            timings: body.timings,
            description: body.description
        });

        return NextResponse.json(newLocation);
    } catch (error) {
        console.error("Locations POST API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred." },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const ownerId = session.user.id;
        const url = new URL(req.url);
        const locationId = url.searchParams.get("id");

        if (!locationId) {
            return NextResponse.json(
                { message: "Location ID is required" },
                { status: 400 }
            );
        }

        await connectDb();
        await Location.findOneAndDelete({ _id: locationId, ownerId });

        return NextResponse.json({ message: "Location deleted successfully" });
    } catch (error) {
        console.error("Locations DELETE API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred." },
            { status: 500 }
        );
    }
}
