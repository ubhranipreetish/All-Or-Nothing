import { Schema, model, Types } from "mongoose";

export interface ILoan {
    userId: Types.ObjectId;
    amount: number;
    status: "ACTIVE" | "REPAID";
    createdAt: Date;
    repaidAt?: Date;
}

const LoanSchema = new Schema<ILoan>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "REPAID"],
            default: "ACTIVE",
        },
        repaidAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Index for finding active loans
LoanSchema.index({ userId: 1, status: 1 });

export default model<ILoan>("Loan", LoanSchema);
