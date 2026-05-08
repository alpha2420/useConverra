import mongoose, { model, Schema } from "mongoose";
 
interface IService {
    name: string;
    description: string;
    price: string;
    duration: string;
    availability: string;
}

interface ISettings {
    ownerId: string;
    businessName: string;
    businessType: string;
    description: string;
    location: string;
    workingHours: string;
    website: string;
    // Services & Products
    services: IService[];
    // Knowledge
    knowledge: string;
    faqs: { question: string; answer: string }[];
    policies: {
        refund: string;
        cancellation: string;
        delivery: string;
        bookingRules: string;
        returnPolicy: string;
        general: string;
    };
    // Human Support Escalation
    supportEmail: string;
    whatsappNumber: string;
    supportNumber: string;
    emergencyContact: string;
    // Agent Instructions — custom AI behavior rules per business
    agentInstructions: string;
    mediaLinks: { name: string; url: string }[];
    aiOverrides: { topic: string; response: string }[];
}
 
const settingsSchema = new Schema<ISettings>(
    {
        ownerId: { type: String, required: true, unique: true },
        businessName: { type: String },
        businessType: { type: String, default: "" },
        description: { type: String, default: "" },
        location: { type: String, default: "" },
        workingHours: { type: String, default: "" },
        website: { type: String, default: "" },
        // Services
        services: {
            type: [{
                name: { type: String, default: "" },
                description: { type: String, default: "" },
                price: { type: String, default: "" },
                duration: { type: String, default: "" },
                availability: { type: String, default: "" },
            }],
            default: []
        },
        // Knowledge
        knowledge: { type: String },
        faqs: { type: [{ question: String, answer: String }], default: [] },
        policies: {
            type: {
                refund: { type: String, default: "" },
                cancellation: { type: String, default: "" },
                delivery: { type: String, default: "" },
                bookingRules: { type: String, default: "" },
                returnPolicy: { type: String, default: "" },
                general: { type: String, default: "" },
            },
            default: { refund: "", cancellation: "", delivery: "", bookingRules: "", returnPolicy: "", general: "" }
        },
        // Support Escalation
        supportEmail: { type: String },
        whatsappNumber: { type: String },
        supportNumber: { type: String, default: "" },
        emergencyContact: { type: String, default: "" },
        agentInstructions: { type: String, default: "" },
        mediaLinks: { type: [{ name: String, url: String }], default: [] },
        aiOverrides: { type: [{ topic: String, response: String }], default: [] },
    },
    { timestamps: true }
);
 
const Settings = mongoose.models.Settings || model("Settings", settingsSchema);
export default Settings;