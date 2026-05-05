import mongoose, { model, Schema } from "mongoose";
 
interface ISettings {
    ownerId: string;
    businessName: string;
    supportEmail: string;
    whatsappNumber: string;
    businessType: string;
    description: string;
    knowledge: string;
    faqs: { question: string; answer: string }[];
    policies: { refund: string; cancellation: string; general: string };
    // Agent Instructions — custom AI behavior rules per business
    agentInstructions: string;
    mediaLinks: { name: string; url: string }[];
    aiOverrides: { topic: string; response: string }[];
}
 
const settingsSchema = new Schema<ISettings>(
    {
        ownerId: { type: String, required: true, unique: true },
        businessName: { type: String },
        supportEmail: { type: String },
        whatsappNumber: { type: String },
        businessType: { type: String, default: "" },
        description: { type: String, default: "" },
        knowledge: { type: String },
        faqs: { type: [{ question: String, answer: String }], default: [] },
        policies: {
            type: {
                refund: { type: String, default: "" },
                cancellation: { type: String, default: "" },
                general: { type: String, default: "" },
            },
            default: { refund: "", cancellation: "", general: "" }
        },
        agentInstructions: { type: String, default: "" },
        mediaLinks: { type: [{ name: String, url: String }], default: [] },
        aiOverrides: { type: [{ topic: String, response: String }], default: [] },
    },
    { timestamps: true }
);
 
const Settings = mongoose.models.Settings || model("Settings", settingsSchema);
export default Settings;