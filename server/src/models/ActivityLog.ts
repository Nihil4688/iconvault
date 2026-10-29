import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ACTIVITY_ACTIONS = [
  "create",
  "update",
  "delete",
  "duplicate",
  "upload",
  "build",
  "clear",
  "restore",
  "move",
  "tag",
  "optimize",
  "copy",
  "import",
  "transfer",
] as const;

export const ACTIVITY_ENTITY_TYPES = ["project", "icon", "folder"] as const;
export const ACTIVITY_BUILD_TYPES = ["font", "sprite"] as const;

const activityLogSchema = new Schema(
  {
    performedById: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    performedBy: { type: String, required: true, immutable: true },
    actionDone: { type: String, enum: ACTIVITY_ACTIONS, required: true, immutable: true },
    actionSummary: { type: String, required: true, immutable: true },
    entityName: { type: String, default: null, immutable: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    owner: { type: String, required: true, immutable: true },
    entityType: { type: String, enum: ACTIVITY_ENTITY_TYPES, required: true, immutable: true },
    buildType: { type: String, enum: [...ACTIVITY_BUILD_TYPES, null], default: null, immutable: true },
    timestamp: { type: Date, default: Date.now, immutable: true },
    entityId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    projectId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    details: { type: Schema.Types.Mixed, default: {}, immutable: true },
    changes: { type: Schema.Types.Mixed, default: null, immutable: true },
    affectedEntityIds: { type: [Schema.Types.ObjectId], default: [], immutable: true },
    result: { type: String, enum: ["success", "partial", "failure"], default: "success", immutable: true },
  },
  {
    collection: "activitylogs",
    versionKey: false,
  },
);

activityLogSchema.index({ projectId: 1, timestamp: -1 });
activityLogSchema.index({ entityId: 1, timestamp: -1 });
activityLogSchema.index({ performedById: 1, timestamp: -1 });

export type ActivityLogDoc = InferSchemaType<typeof activityLogSchema>;
export type ActivityLogModel = Model<ActivityLogDoc>;

const ActivityLog: ActivityLogModel =
  (mongoose.models.ActivityLog as ActivityLogModel | undefined) ??
  mongoose.model<ActivityLogDoc>("ActivityLog", activityLogSchema);

export default ActivityLog;
