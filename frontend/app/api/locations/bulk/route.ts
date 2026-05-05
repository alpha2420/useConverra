import connectDb from "@shared/lib/db";
import Location from "@backend/models/location.model";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const ownerId = session.user.id;
        
        const formData = await req.formData();
        const file = formData.get("file") as File;
        
        if (!file) {
            return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
        }

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        
        if (lines.length <= 1) {
            return NextResponse.json({ message: "CSV is empty or missing data rows" }, { status: 400 });
        }

        // Basic CSV parse (assuming comma-separated, no commas inside values for simplicity)
        const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
        
        const nameIdx = headers.indexOf("name");
        const cityIdx = headers.indexOf("city");
        const addressIdx = headers.indexOf("address");
        const phoneIdx = headers.indexOf("phone");
        const timingsIdx = headers.indexOf("timings");
        const descIdx = headers.indexOf("description");

        if (nameIdx === -1 || cityIdx === -1) {
            return NextResponse.json({ message: "CSV must contain 'Name' and 'City' columns" }, { status: 400 });
        }

        const locationsToInsert = [];
        
        for (let i = 1; i < lines.length; i++) {
            // Using a simple split fallback (real CSV parser recommended for prod if commas inside quotes are used)
            // But this matches the generic use case.
            const row = lines[i].split(",").map(v => v.trim());
            
            if (!row[nameIdx] || !row[cityIdx]) continue; // Skip invalid rows

            locationsToInsert.push({
                ownerId,
                name: row[nameIdx],
                city: row[cityIdx],
                address: addressIdx !== -1 ? row[addressIdx] : "",
                phone: phoneIdx !== -1 ? row[phoneIdx] : "",
                timings: timingsIdx !== -1 ? row[timingsIdx] : "",
                description: descIdx !== -1 ? row[descIdx] : ""
            });
        }

        if (locationsToInsert.length === 0) {
            return NextResponse.json({ message: "No valid rows found to insert" }, { status: 400 });
        }

        await connectDb();
        await Location.insertMany(locationsToInsert);

        return NextResponse.json({ 
            message: `Successfully inserted ${locationsToInsert.length} locations.`,
            count: locationsToInsert.length
        });
        
    } catch (error) {
        console.error("Locations Bulk API error:", error);
        return NextResponse.json(
            { message: "An internal server error occurred." },
            { status: 500 }
        );
    }
}
