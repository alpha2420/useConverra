import mongoose, { model, Schema, Document, Model } from "mongoose";

export type CRMStage = "new" | "contacted" | "interested" | "negotiating" | "won" | "lost";

export interface IEnriched {
    company: string | null;
    location: string | null;
    email: string | null;
    language: string | null;
}

export interface ILead extends Document {
    ownerId: string; // The Business Tenant ID
    contactNumber: string;
    contactName: string;
    
    // CRM Fields
    stage: CRMStage;
    leadScore: "hot" | "warm" | "cold";
    notes: string;
    tags: string[];
    
    // Enriched Records (extracted by AI or from outside)
    enriched: IEnriched;
    
    // Extracted directly from chat via AI
    extractedBudget: string | null;
    
    // Last time we heard from or spoke to this lead
    lastContactAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const EnrichedSchema = new Schema<IEnriched>(
    {
        company: { type: String, default: null },
        location: { type: String, default: null },
        email: { type: String, default: null },
        language: { type: String, default: null },
    },
    { _id: false }
);

const LeadSchema = new Schema<ILead>(
    {
        ownerId: { type: String, required: true, index: true },
        contactNumber: { type: String, required: true },
        contactName: { type: String, default: "" },
        
        stage: {
            type: String,
            enum: ["new", "contacted", "interested", "negotiating", "won", "lost"],
            default: "new",
        },
        leadScore: { type: String, enum: ["hot", "warm", "cold"], default: "cold" },
        notes: { type: String, default: "" },
        tags: { type: [String], default: [] },
        
        enriched: { type: EnrichedSchema, default: () => ({}) },
        extractedBudget: { type: String, default: null },
        
        lastContactAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// A Lead is unique per Business Tenant (ownerId) and phone number
LeadSchema.index({ ownerId: 1, contactNumber: 1 }, { unique: true });

const Lead: Model<ILead> = mongoose.models.Lead || model<ILead>("Lead", LeadSchema);

export default Lead;
