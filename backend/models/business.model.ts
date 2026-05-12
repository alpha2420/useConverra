import mongoose, { model, Schema, Document, Model } from "mongoose";

export interface IBusiness extends Document {
    name: string;
    industry: string;
    subscriptionPlan: "free" | "pro" | "enterprise";
    status: "active" | "suspended";
    ownerUserId: string; // The primary User._id who created this tenant
    createdAt: Date;
    updatedAt: Date;
}

const BusinessSchema = new Schema<IBusiness>(
    {
        name: { type: String, required: true, trim: true },
        industry: { type: String, default: "General" },
        subscriptionPlan: { 
            type: String, 
            enum: ["free", "pro", "enterprise"], 
            default: "free" 
        },
        status: { 
            type: String, 
            enum: ["active", "suspended"], 
            default: "active" 
        },
        ownerUserId: { type: String, required: true, index: true },
    },
    { timestamps: true }
);

const Business: Model<IBusiness> =
    mongoose.models.Business || model<IBusiness>("Business", BusinessSchema);

export default Business;
