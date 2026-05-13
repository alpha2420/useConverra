import mongoose, { Schema, Document } from "mongoose";

export interface IVisit extends Document {
    ownerId: string;      // The business owner
    leadId: mongoose.Types.ObjectId; // The customer (Lead)
    visitDate: Date;      // When they are coming
    status: "pending" | "confirmed" | "completed" | "cancelled";
    notes?: string;       // Any extra info (e.g., "coming with parents")
    createdAt: Date;
    updatedAt: Date;
}

const VisitSchema: Schema = new Schema(
    {
        ownerId: { type: String, required: true, index: true },
        leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
        visitDate: { type: Date, required: true },
        status: { 
            type: String, 
            enum: ["pending", "confirmed", "completed", "cancelled"], 
            default: "pending" 
        },
        notes: { type: String },
    },
    { timestamps: true }
);

// Index for fast dashboard queries (e.g., "Who is visiting today?")
VisitSchema.index({ ownerId: 1, visitDate: 1 });

export default mongoose.models.Visit || mongoose.model<IVisit>("Visit", VisitSchema);
