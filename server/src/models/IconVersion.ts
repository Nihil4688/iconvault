// A saved earlier state of an icon. Each version stores its own SVG markup, so restoring really brings back the old content (the old system pointed every version at the same file).
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { MAX_SVG_CHARS } from "./Icon.js";

export const iconVersionSchema = new Schema(
  {
    iconId: {
      type: Schema.Types.ObjectId,
      ref: "Icon",
      required: true,
    },
    // The markup as it was before the change that created this version.
    svg: {
      type: String,
      required: true,
      maxlength: MAX_SVG_CHARS,
    },
    byteSize: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    // Versions are never edited, so only the creation time is kept.
    timestamps: { createdAt: true, updatedAt: false },
    collection: "icon_versions",
  },
);

// History of one icon, newest first.
iconVersionSchema.index({ iconId: 1, createdAt: -1 });

export type IconVersionDoc = InferSchemaType<typeof iconVersionSchema>;
export type IconVersionModel = Model<IconVersionDoc>;

const IconVersion: IconVersionModel =
  (mongoose.models.IconVersion as IconVersionModel | undefined) ??
  mongoose.model<IconVersionDoc>("IconVersion", iconVersionSchema);

export default IconVersion;
