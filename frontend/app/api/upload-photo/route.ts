import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@shared/lib/getSession";
import connectDb from "@shared/lib/db";
import Settings from "@backend/models/settings.model";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary from env variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
    try {
        // 1. Auth check
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ownerId = session.user.id;

        // 2. Parse the uploaded file
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const name = (formData.get("name") as string) || "Hostel Photo";

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // 3. Validate it is an image
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }

        // 4. Convert file to base64 for Cloudinary upload
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataURI = `data:${file.type};base64,${base64}`;

        // 5. Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(dataURI, {
            folder: `useaii/${ownerId}`,      // Organized per business owner
            resource_type: "image",
            quality: "auto",                   // Auto-compress for fast loading
            fetch_format: "auto",              // Serve WebP where supported
        });

        const photoUrl = uploadResult.secure_url;
        console.log(`[PhotoUpload] Uploaded for ${ownerId}: ${photoUrl}`);

        // 6. Save the URL into the business's mediaLinks in Settings
        await connectDb();
        await Settings.findOneAndUpdate(
            { ownerId },
            { $push: { mediaLinks: { name, url: photoUrl } } },
            { upsert: true }
        );

        return NextResponse.json({ 
            success: true, 
            url: photoUrl,
            message: "Photo uploaded successfully"
        });

    } catch (error: any) {
        console.error("[PhotoUpload] Error:", error);
        return NextResponse.json(
            { error: "Failed to upload photo. Please try again." },
            { status: 500 }
        );
    }
}

// DELETE: Remove a photo from the gallery
export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ownerId = session.user.id;
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "No URL provided" }, { status: 400 });
        }

        await connectDb();
        await Settings.findOneAndUpdate(
            { ownerId },
            { $pull: { mediaLinks: { url } } }
        );

        return NextResponse.json({ success: true, message: "Photo removed from gallery" });

    } catch (error) {
        console.error("[PhotoUpload] Delete Error:", error);
        return NextResponse.json({ error: "Failed to remove photo" }, { status: 500 });
    }
}
