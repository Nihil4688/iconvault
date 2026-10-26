// A sprite ZIP an editor downloaded from the Sprite Builder, kept so it can be downloaded again or deleted later ("Sprite build history"). The ZIP is built in the browser and sent here after the download; only the ZIP and a few facts about it are stored.
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const MAX_STORED_SPRITE_BUILDS = 20;
// A stored ZIP must fit comfortably inside MongoDB's 16 MB document limit.
export const MAX_STORED_SPRITE_BYTES = 12 * 1024 * 1024;
export const SPRITE_MODES = ["symbol", "stack", "css"] as const;

export const spriteBuildSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // 1 for the first sprite kept for the project, then 2, 3, ... (never reused).
    version: { type: Number, required: true, min: 1 },
    mode: { type: String, enum: SPRITE_MODES, required: true },
    iconCount: { type: Number, required: true, min: 0 },
    // Size of the ZIP in bytes.
    size: { type: Number, required: true, min: 0 },
    zip: { type: Buffer, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "sprite_builds",
  },
);

spriteBuildSchema.index({ projectId: 1, createdAt: -1 });

export type SpriteBuildDoc = InferSchemaType<typeof spriteBuildSchema>;
export type SpriteBuildModel = Model<SpriteBuildDoc>;

const SpriteBuild: SpriteBuildModel = (mongoose.models.SpriteBuild as SpriteBuildModel | undefined) ?? mongoose.model<SpriteBuildDoc>("SpriteBuild", spriteBuildSchema);

export default SpriteBuild;
