import mongoose, { model, Schema, Document, Model } from "mongoose";

export interface IMessage {
    role: "customer" | "bot" | "owner";
    text: string;
    timestamp: Date;
}

export interface IConversation extends Document {
    ownerId: string; // The Business Tenant ID
    contactNumber: string; // Used to quickly find the conversation
    leadId: mongoose.Types.ObjectId; // Reference to the Lead
    
    messages: IMessage[];
    
    // AI Analysis (Specific to this ongoing conversation)
    intent: "buying" | "inquiry" | "complaint" | "spam" | "unknown";
    urgency: "high" | "medium" | "low";
    summary: string | null;
    lastAnalyzedAt: Date | null;
    sentiment: "positive" | "neutral" | "negative" | "unknown";
    
    source: "whatsapp" | "widget" | "email" | "unknown";
    firstReplyTime: number | null; // in seconds
    
    // Next Best Action (AI suggestion for the owner)
    nextBestAction: string | null;
    nextBestActionType: "follow_up" | "send_pricing" | "close" | "nurture" | "escalate" | "none" | null;
    
    // State
    isAiPaused: boolean;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        role: { type: String, enum: ["customer", "bot", "owner"], required: true },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
    {
        ownerId: { type: String, required: true, index: true },
        contactNumber: { type: String, required: true },
        leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
        
        messages: { type: [MessageSchema], default: [] },
        
        // AI Analysis
        intent: {
            type: String,
            enum: ["buying", "inquiry", "complaint", "spam", "unknown"],
            default: "unknown",
        },
        urgency: { type: String, enum: ["high", "medium", "low"], default: "low" },
        summary: { type: String, default: null },
        lastAnalyzedAt: { type: Date, default: null },
        sentiment: { 
            type: String, 
            enum: ["positive", "neutral", "negative", "unknown"], 
            default: "unknown" 
        },
        
        source: { 
            type: String, 
            enum: ["whatsapp", "widget", "email", "unknown"], 
            default: "whatsapp" 
        },
        firstReplyTime: { type: Number, default: null },
        
        // Next Best Action
        nextBestAction: { type: String, default: null },
        nextBestActionType: {
            type: String,
            enum: ["follow_up", "send_pricing", "close", "nurture", "escalate", "none", null],
            default: null,
        },
        
        isAiPaused: { type: Boolean, default: false },
        lastMessageAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// One active conversation per lead
ConversationSchema.index({ ownerId: 1, contactNumber: 1 }, { unique: true });

// Indexes for fast dashboard stats
ConversationSchema.index({ ownerId: 1, createdAt: 1 });
ConversationSchema.index({ ownerId: 1, lastMessageAt: -1 });
ConversationSchema.index({ ownerId: 1, intent: 1 });
ConversationSchema.index({ ownerId: 1, urgency: 1 });

const Conversation: Model<IConversation> =
    mongoose.models.Conversation ||
    model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
