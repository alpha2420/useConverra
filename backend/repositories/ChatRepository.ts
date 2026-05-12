import Conversation, { IConversation, IMessage } from "../models/conversation.model";
import Lead, { ILead } from "../models/lead.model";
import mongoose from "mongoose";

export class ChatRepository {
    /**
     * Gets or creates a Lead and their corresponding Conversation.
     * Ensures atomic creation to avoid race conditions.
     */
    static async getOrCreateChat(
        ownerId: string, 
        contactNumber: string, 
        contactName: string = ""
    ): Promise<{ lead: ILead, conversation: IConversation }> {
        // Find or create the Lead
        let lead = await Lead.findOne({ ownerId, contactNumber });
        if (!lead) {
            try {
                lead = await Lead.create({ ownerId, contactNumber, contactName });
            } catch (err: any) {
                // Handle race condition if created concurrently
                if (err.code === 11000) {
                    lead = await Lead.findOne({ ownerId, contactNumber });
                } else {
                    throw err;
                }
            }
        }

        // Find or create the Conversation
        let conversation = await Conversation.findOne({ ownerId, contactNumber });
        if (!conversation && lead) {
            try {
                conversation = await Conversation.create({ 
                    ownerId, 
                    contactNumber, 
                    leadId: lead._id 
                });
            } catch (err: any) {
                if (err.code === 11000) {
                    conversation = await Conversation.findOne({ ownerId, contactNumber });
                } else {
                    throw err;
                }
            }
        }

        if (!lead || !conversation) {
            throw new Error("Failed to get or create chat entities");
        }

        return { lead, conversation };
    }

    /**
     * Adds a message to the conversation and updates the lastMessageAt timestamp.
     */
    static async saveMessage(
        ownerId: string, 
        contactNumber: string, 
        role: "customer" | "bot" | "owner", 
        text: string
    ): Promise<IConversation | null> {
        return Conversation.findOneAndUpdate(
            { ownerId, contactNumber },
            {
                $push: { messages: { role, text, timestamp: new Date() } },
                $set: { lastMessageAt: new Date() },
            },
            { new: true }
        );
    }

    /**
     * Updates the AI analysis fields for a conversation.
     */
    static async updateConversationAnalysis(
        ownerId: string, 
        contactNumber: string, 
        analysisData: Partial<IConversation>
    ): Promise<IConversation | null> {
        return Conversation.findOneAndUpdate(
            { ownerId, contactNumber },
            { $set: analysisData },
            { new: true }
        );
    }

    /**
     * Updates the CRM fields for a Lead.
     */
    static async updateLead(
        ownerId: string, 
        contactNumber: string, 
        leadData: Partial<ILead>
    ): Promise<ILead | null> {
        return Lead.findOneAndUpdate(
            { ownerId, contactNumber },
            { $set: leadData },
            { new: true }
        );
    }

    /**
     * Fetches recent conversation history.
     */
    static async getRecentHistory(ownerId: string, contactNumber: string, limit: number = 20): Promise<IMessage[]> {
        const convo = await Conversation.findOne({ ownerId, contactNumber }, { messages: { $slice: -limit } }).lean();
        return convo ? (convo.messages as IMessage[]) : [];
    }
}
