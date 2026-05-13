import { ITool } from "../ITool";

export class TicketTool implements ITool {
    name = "create_support_ticket";
    description = "Creates an urgent support ticket for human intervention. Use this when the customer is extremely angry, requests a human immediately, or has a complex issue the AI cannot resolve.";
    parameters = {
        type: "object",
        properties: {
            contactNumber: {
                type: "string",
                description: "The phone number of the customer"
            },
            issueDescription: {
                type: "string",
                description: "A short summary of the customer's problem"
            },
            urgency: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
                description: "The urgency level of the ticket"
            }
        },
        required: ["contactNumber", "issueDescription", "urgency"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        // In a real application, this might insert into a `Ticket` Mongoose model 
        // or call an external API like Zendesk or Freshdesk.
        console.log(`[TicketTool] Creating ticket for ${ownerId}:`, args);
        
        return `Success: Support ticket created successfully. A human agent has been notified and will contact the user shortly.`;
    }
}
