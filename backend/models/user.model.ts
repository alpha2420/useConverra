import mongoose, { model, Schema } from "mongoose";
 
export type UserRole = "owner" | "admin" | "agent" | "viewer";
 
interface IUser {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    // For sub-users: which business tenant they belong to
    businessId: mongoose.Types.ObjectId | null;
    parentOwnerId: string | null; // Deprecated, use businessId instead
    credits: number;
    isSuperAdmin: boolean;
    isActive: boolean;
}
 
const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        role: {
            type: String,
            enum: ["owner", "admin", "agent", "viewer"],
            default: "owner",
        },
        businessId: { type: Schema.Types.ObjectId, ref: "Business", default: null },
        // null = top-level owner account. Set to ownerId for sub-users.
        parentOwnerId: { type: String, default: null },
        credits: { type: Number, default: 100000 }, // Tokens or Credits (e.g., 100k free start)
        isSuperAdmin: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);
 
const User = mongoose.models.User || model("User", userSchema);
export default User;
