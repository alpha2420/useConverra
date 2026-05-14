import { ITool } from "../ITool";
import Lead from "../../models/lead.model";
import { ChatRepository } from "../../repositories/ChatRepository";

/**
 * WorkflowCRMTool — Updates the CRM stage of a lead from a Workflow trigger.
 * 
 * This is specifically designed for Workflow Engine execution, where the 
 * contactNumber comes from the triggerData context automatically.
 */
export class WorkflowCRMTool implements ITool {
    name = "CRMTool";
    description = "Updates the CRM lead stage for the customer who triggered this workflow. Also adds an optional note to the conversation.";
    parameters = {
        type: "object",
        properties: {
            stage: {
                type: "string",
                enum: ["new", "contacted", "interested", "negotiating", "won", "lost"],
                description: "The new CRM stage to assign to the lead"
            },
            note: {
                type: "string",
                description: "Optional note to add to the conversation history"
            }
        },
        required: ["stage"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        const { stage, contactNumber, contactName, note } = args;

        if (!contactNumber) {
            return "Failed: No contact number found in workflow context.";
        }

        try {
            const updated = await Lead.findOneAndUpdate(
                { ownerId, contactNumber },
                { stage, updatedAt: new Date() },
                { upsert: true, new: true }
            );

            if (note) {
                await ChatRepository.saveMessage(ownerId, contactNumber, "bot", `[Workflow Note]: ${note}`);
            }

            console.log(`[WorkflowCRMTool] Lead ${contactNumber} moved to stage: ${stage}`);
            return `Success: Lead ${contactName || contactNumber} moved to "${stage}" in CRM.${note ? ` Note added.` : ""}`;
        } catch (err: any) {
            console.error("[WorkflowCRMTool] Error:", err.message);
            return `Failed: Could not update CRM stage. Error: ${err.message}`;
        }
    }
}
