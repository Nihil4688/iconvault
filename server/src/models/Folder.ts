// A folder inside a project. Folders nest through parentId; a null parent means the project root.
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const folderSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    // Null for a top-level folder. Cycle and same-project checks are enforced by the service layer, not the database.
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    // Position among siblings.
    orderIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "folders",
  },
);

// Children of a folder (or of the root) in display order.
folderSchema.index({ projectId: 1, parentId: 1, orderIndex: 1 });

export type FolderDoc = InferSchemaType<typeof folderSchema>;
export type FolderModel = Model<FolderDoc>;

const Folder: FolderModel =
  (mongoose.models.Folder as FolderModel | undefined) ??
  mongoose.model<FolderDoc>("Folder", folderSchema);

export default Folder;
