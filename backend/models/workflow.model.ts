import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkflow extends Document {
    ownerId: string;
    businessId: string;
    name: string;
    triggerEvent: 'WHATSAPP_MESSAGE' | 'IMAGE_UPLOAD' | 'VOICE_NOTE';
    isActive: boolean;
    nodes: any[]; // Array of JSON nodes representing the workflow sequence
    createdAt: Date;
    updatedAt: Date;
}

const WorkflowSchema: Schema = new Schema({
    ownerId: { type: String, required: true },
    businessId: { type: String, required: true },
    name: { type: String, required: true },
    triggerEvent: { 
        type: String, 
        enum: ['WHATSAPP_MESSAGE', 'IMAGE_UPLOAD', 'VOICE_NOTE'], 
        required: true 
    },
    isActive: { type: Boolean, default: true },
    nodes: [{ type: Schema.Types.Mixed }] // Flexible schema for polymorphic nodes
}, { timestamps: true });

// Avoid duplicate model compilation in Next.js development
export const Workflow = mongoose.models.Workflow || mongoose.model<IWorkflow>('Workflow', WorkflowSchema);
