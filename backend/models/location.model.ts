import mongoose, { model, Schema } from "mongoose";

interface ILocation {
    ownerId: string;
    name: string;
    city: string;
    address: string;
    phone: string;
    timings: string;
    description: string;
}

const locationSchema = new Schema<ILocation>(
    {
        ownerId: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        address: { type: String, default: "" },
        phone: { type: String, default: "" },
        timings: { type: String, default: "" },
        description: { type: String, default: "" },
    },
    { timestamps: true }
);

// Add an index so querying locations by ownerId is fast
locationSchema.index({ ownerId: 1 });

const Location = mongoose.models.Location || model("Location", locationSchema);
export default Location;
