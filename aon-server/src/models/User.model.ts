import { Schema, model } from "mongoose";

const UserSchema = new Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    name: String,
    avatar: String,
  },
  { timestamps: true }
);

export default model("User", UserSchema);
