import type { Request } from "express";
import type { Types } from "mongoose";
import { UnauthorizedError } from "../lib/errors.js";
import ActivityLog, { type ActivityLogDoc } from "../models/ActivityLog.js";
import User from "../models/User.js";
import type { ACTIVITY_ACTIONS, ACTIVITY_BUILD_TYPES, ACTIVITY_ENTITY_TYPES } from "../models/ActivityLog.js";

type Id = Types.ObjectId;
type ActorSnapshot = { _id: Id; displayName: string };
type ProjectSnapshot = { _id: Id; name: string; ownerId: Id };

export type ActivityInput = {
  actionDone: (typeof ACTIVITY_ACTIONS)[number];
  entityType: (typeof ACTIVITY_ENTITY_TYPES)[number];
  entityId?: Id | null;
  entityName?: string | null;
  ownerName?: string;
  buildType?: (typeof ACTIVITY_BUILD_TYPES)[number] | null;
  details?: Record<string, unknown>;
  changes?: Record<string, unknown> | null;
  affectedEntityIds?: Id[];
  result?: "success" | "partial";
};

function activitySummary(project: ProjectSnapshot, input: ActivityInput): string {
  const entityName = input.entityName ?? project.name;
  const count = Number(
    input.details?.affectedCount ??
      input.details?.createdCount ??
      input.details?.deletedCount ??
      input.details?.iconCount ??
      input.details?.matchedCount ??
      0,
  );

  switch (input.actionDone) {
    case "create":
      return input.entityType === "project"
        ? `Created project "${entityName}"`
        : `Created ${input.entityType} "${entityName}" in project "${project.name}"`;
    case "update": {
      const fields = Object.keys(input.changes ?? {}).join(", ");
      return `Updated ${input.entityType} "${entityName}" in project "${project.name}"${fields ? `; changed ${fields}` : ""}`;
    }
    case "delete":
      if (input.details?.recordType === "fontBuild" || input.details?.recordType === "spriteBuild") {
        return `Deleted ${input.buildType ?? "project"} build "${String(input.details.buildId)}" from project "${project.name}"`;
      }
      if (input.entityType === "icon" && !input.entityName) {
        return input.details?.deletionMode === "trash"
          ? `Moved ${count} icons to trash in project "${project.name}"`
          : `Permanently deleted ${count} icons from project "${project.name}"`;
      }
      return input.details?.deletionMode === "trash"
        ? `Moved icon "${entityName}" to trash in project "${project.name}"`
        : `Deleted ${input.entityType} "${entityName}" in project "${project.name}"`;
    case "duplicate":
      return `Duplicated project "${String(input.details?.sourceProjectName ?? entityName)}" as "${project.name}"`;
    case "upload":
      return `Uploaded ${count} icon${count === 1 ? "" : "s"} to project "${project.name}"`;
    case "build":
      return `Built ${input.buildType ?? "asset"} for project "${project.name}"${input.details?.version ? ` (v${String(input.details.version)})` : ""}`;
    case "clear":
      return `Cleared ${count} icon${count === 1 ? "" : "s"} from trash in project "${project.name}"`;
    case "restore":
      if (input.entityType === "icon" && !input.entityName) {
        return `Restored ${Number(input.details?.restoredCount ?? count)} icons in project "${project.name}"`;
      }
      return `Restored ${input.entityType} "${entityName}" in project "${project.name}"`;
    case "move":
      if (input.entityType === "icon" && !input.entityName) {
        return `Moved ${count} icons in project "${project.name}"`;
      }
      return `Moved ${input.entityType} "${entityName}" in project "${project.name}"`;
    case "tag":
      return `Updated tags for ${Number(input.details?.matchedCount ?? count)} icon${Number(input.details?.matchedCount ?? count) === 1 ? "" : "s"} in project "${project.name}"`;
    case "optimize":
      if (input.entityType === "icon" && !input.entityName) {
        return `Optimized ${Number(input.details?.optimizedCount ?? count)} icons in project "${project.name}"`;
      }
      return `Optimized ${input.entityType} "${entityName}" in project "${project.name}"`;
    case "copy":
      return `Copied ${Number(input.details?.affectedCount ?? count)} icons into project "${project.name}"`;
    case "import":
      return `Imported project "${project.name}" with ${count} icon${count === 1 ? "" : "s"}`;
    case "transfer":
      return `Transferred project "${project.name}" to "${String(input.details?.newOwner ?? "another owner")}"`;
  }
}

export async function recordActivity(
  actor: ActorSnapshot,
  project: ProjectSnapshot,
  input: ActivityInput,
): Promise<ActivityLogDoc> {
  const owner =
    input.ownerName ??
    (String(project.ownerId) === String(actor._id)
      ? actor.displayName
      : (await User.findById(project.ownerId).select({ displayName: 1 }).lean())?.displayName ?? "Unknown user");

  return ActivityLog.create({
    performedById: actor._id,
    performedBy: actor.displayName,
    actionDone: input.actionDone,
    actionSummary: activitySummary(project, input),
    entityName: input.entityName ?? null,
    ownerId: project.ownerId,
    owner,
    entityType: input.entityType,
    buildType: input.buildType ?? null,
    entityId: input.entityId ?? null,
    projectId: project._id,
    details: input.details ?? {},
    changes: input.changes ?? null,
    affectedEntityIds: input.affectedEntityIds ?? [],
    result: input.result ?? "success",
  });
}

export async function recordRequestActivity(
  req: Request,
  project: ProjectSnapshot,
  input: ActivityInput,
): Promise<ActivityLogDoc> {
  if (!req.user) throw new UnauthorizedError();
  return recordActivity(req.user, project, input);
}
