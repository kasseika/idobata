import mongoose, { Schema } from "mongoose";
import { ITheme } from "../types/index.js";

const themeSchema = new Schema<ITheme>(
  {
    title: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      required: false,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
    },
  },
  { timestamps: true }
);

const Theme = mongoose.model<ITheme>("Theme", themeSchema);

export default Theme;
