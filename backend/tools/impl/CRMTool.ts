import { ITool } from "../ITool";
import Lead from "../../models/lead.model";

export class CRMTool implements ITool {
    name = "update_lead_stage";
    description = "Updates the stage of a lead in the CRM. Use this when a customer explicitly books a visit, is no longer interested, or takes a specific action.";
    parameters = {
        type: "object",
        properties: {
            contactNumber: {
                type: "string",
                description: "The phone number of the customer"
            },
            stage: {
                type: "string",
                enum: ["new", "engaged", "visit_booked", "won", "lost"],
                description: "The new stage to set for the lead"
            }
        },
        required: ["contactNumber", "stage"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        try {
            const { contactNumber, stage } = args;
            const updated = await Lead.findOneAndUpdate(
                { ownerId, contactNumber },
                { stage, updatedAt: new Date() },
                { new: true }
            );
            
            if (updated) {
                return `Success: Lead stage updated to ${stage}.`;
            }
            return `Failed: Could not find lead with contact number ${contactNumber}.`;
        } catch (err) {
            console.error("[CRMTool] Error:", err);
            return "Failed: Internal database error while updating lead.";
        }
    }
}
