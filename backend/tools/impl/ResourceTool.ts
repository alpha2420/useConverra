import { ITool } from "../ITool";
import Settings from "../../models/settings.model";

export class ResourceTool implements ITool {
    name = "get_property_resources";
    description = "Fetches the hostel's photo gallery links and location resources to share with a customer who has asked for photos, location, or to see the property. Use this whenever a customer says 'send photos', 'share images', 'where are you located', or 'send location'.";
    parameters = {
        type: "object",
        properties: {
            resourceType: {
                type: "string",
                enum: ["photos", "location", "all"],
                description: "What type of resource the customer is asking for"
            }
        },
        required: ["resourceType"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        try {
            const { resourceType } = args;
            const settings = await Settings.findOne({ ownerId }).lean();

            if (!settings) {
                return "Failed: Business settings not found.";
            }

            const parts: string[] = [];

            // Return location if requested
            if (resourceType === "location" || resourceType === "all") {
                if (settings.location) {
                    parts.push(`📍 Location: ${settings.location}`);
                }
            }

            // Return photos/gallery links if requested
            if (resourceType === "photos" || resourceType === "all") {
                const mediaLinks = settings.mediaLinks || [];
                if (mediaLinks.length > 0) {
                    const photoLines = mediaLinks
                        .map((m: { name: string; url: string }) => `📸 ${m.name}: ${m.url}`)
                        .join("\n");
                    parts.push(photoLines);
                } else {
                    parts.push("📸 Photos: Our team will share the latest photos with you shortly via WhatsApp.");
                }
            }

            if (parts.length === 0) {
                return "No resources found. Please contact our team directly.";
            }

            return parts.join("\n\n");
        } catch (err) {
            console.error("[ResourceTool] Error:", err);
            return "Failed: Could not retrieve property resources.";
        }
    }
}
