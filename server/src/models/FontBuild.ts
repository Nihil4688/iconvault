// A font package an editor downloaded, kept so it can be downloaded again or deleted later ("Font build history"). Only the finished ZIP and a few facts about it are stored; the icons themselves are not copied.
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const MAX_STORED_BUILDS = 20;
// A stored ZIP must fit comfortably inside MongoDB's 16 MB document limit.
export const MAX_STORED_BUILD_BYTES = 12 * 1024 * 1024;

export const fontBuildSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // 1 for the first package kept for the project, then 2, 3, ... (never reused).
    version: { type: Number, required: true, min: 1 },
    fontName: { type: String, required: true, maxlength: 50 },
    iconCount: { type: Number, required: true, min: 0 },
    formats: { type: [String], default: [] },
    // Size of the ZIP in bytes.
    size: { type: Number, required: true, min: 0 },
    zip: { type: Buffer, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "font_builds",
  },
);

// History of one project, newest first.
fontBuildSchema.index({ projectId: 1, createdAt: -1 });

export type FontBuildDoc = InferSchemaType<typeof fontBuildSchema>;
export type FontBuildModel = Model<FontBuildDoc>;

const FontBuild: FontBuildModel = (mongoose.models.FontBuild as FontBuildModel | undefined) ?? mongoose.model<FontBuildDoc>("FontBuild", fontBuildSchema);

export default FontBuild;
