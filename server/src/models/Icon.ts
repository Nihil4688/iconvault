// A single SVG icon in a project. The cleaned SVG markup is stored in the document itself (no files on disk), so one database backup covers everything.
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Upper bound for one icon's markup, in characters.
export const MAX_SVG_CHARS = 1_000_000;

export const iconSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    // Null means "uncategorized" (the project root).
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    // Display name, e.g. "Arrow Left".
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    // URL- and CSS-friendly identifier, unique among the project's active icons.
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_-]{1,100}$/,
    },
    // The sanitized (and usually optimized) SVG markup.
    svg: {
      type: String,
      required: true,
      maxlength: MAX_SVG_CHARS,
    },
    tags: {
      type: [String],
      default: [],
    },
    // UTF-8 size of `svg`, and of the sanitized markup before optimizing (to show savings).
    byteSize: {
      type: Number,
      required: true,
      min: 0,
    },
    originalByteSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Icon-font codepoint as 4 upper-case hex digits between E000 and F8FF (e.g. "E001"). Stays stable across font rebuilds.
    codepoint: {
      type: String,
      uppercase: true,
      match: /^[0-9A-F]{4,6}$/,
      default: null,
    },
    // Font Builder's project-specific mapping. Kept separate from the uploaded icon's codepoint shown in the Icons section.
    fontCodepoint: {
      type: String,
      uppercase: true,
      match: /^[0-9A-F]{4,6}$/,
      default: null,
    },
    width: {
      type: Number,
      default: 24,
      min: 1,
    },
    height: {
      type: Number,
      default: 24,
      min: 1,
    },
    viewBox: {
      type: String,
      default: "0 0 24 24",
    },
    // Flags used to warn that an icon will not convert cleanly into a font.
    hasStroke: {
      type: Boolean,
      default: false,
    },
    hasGradient: {
      type: Boolean,
      default: false,
    },
    hasText: {
      type: Boolean,
      default: false,
    },
    // Set when the icon is moved to the trash; null while active. Trashed icons keep their data until emptied.
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "icons",
  },
);

// A slug is unique only among active icons, so a slug can be reused while the old icon sits in the trash.
iconSchema.index(
  { projectId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
iconSchema.index(
  { projectId: 1, fontCodepoint: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, fontCodepoint: { $type: "string" } } },
);
// A codepoint is unique per project among active icons that have one.
iconSchema.index(
  { projectId: 1, codepoint: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null, codepoint: { $type: "string" } },
  },
);
// Folder contents and the project's trash view.
iconSchema.index({ projectId: 1, folderId: 1 });
iconSchema.index({ projectId: 1, deletedAt: 1, updatedAt: -1 });

export type IconDoc = InferSchemaType<typeof iconSchema>;
export type IconModel = Model<IconDoc>;

const Icon: IconModel =
  (mongoose.models.Icon as IconModel | undefined) ??
  mongoose.model<IconDoc>("Icon", iconSchema);

export default Icon;
