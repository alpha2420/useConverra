import { ITool } from "../ITool";
import Visit from "../../models/visit.model";
import Lead from "../../models/lead.model";

export class VisitTool implements ITool {
    name = "schedule_hostel_visit";
    description = "Schedules a physical visit to the hostel for a lead. Use this when a customer provides a specific date or time they want to come see the property.";
    parameters = {
        type: "object",
        properties: {
            contactNumber: {
                type: "string",
                description: "The phone number of the customer"
            },
            visitDateTime: {
                type: "string",
                description: "The date and time of the visit (e.g., 'Tomorrow at 5 PM' or '2026-05-20 10:00 AM')"
            },
            notes: {
                type: "string",
                description: "Any additional context (e.g., 'coming with father')"
            }
        },
        required: ["contactNumber", "visitDateTime"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        try {
            const { contactNumber, visitDateTime, notes } = args;

            // 1. Find the Lead
            const lead = await Lead.findOne({ ownerId, contactNumber });
            if (!lead) {
                return `Failed: Could not find a lead with number ${contactNumber}. Please ask the user for their name first.`;
            }

            // 2. Parse the date (Simple parser for demo, usually you'd use chrono-node)
            // For now, we assume a valid date string or relative "tomorrow"
            let finalDate = new Date(visitDateTime);
            if (isNaN(finalDate.getTime())) {
                // Fallback: if AI sent "tomorrow", we set it to +24 hours
                if (visitDateTime.toLowerCase().includes("tomorrow")) {
                    finalDate = new Date();
                    finalDate.setDate(finalDate.getDate() + 1);
                } else {
                    return `Failed: The date format "${visitDateTime}" is invalid. Please ask the user to clarify the date.`;
                }
            }

            // 3. Create the Visit
            const newVisit = await Visit.create({
                ownerId,
                leadId: lead._id,
                visitDate: finalDate,
                notes: notes || "Scheduled via AI Chat",
                status: "pending"
            });

            // 4. Update the Lead stage automatically! (OOP Synergy)
            lead.stage = "visit_booked";
            await lead.save();

            return `Success: Visit scheduled for ${finalDate.toLocaleString()}. The lead stage has been updated to 'visit_booked'.`;
        } catch (err) {
            console.error("[VisitTool] Error:", err);
            return "Failed: Internal error while scheduling the visit.";
        }
    }
}
