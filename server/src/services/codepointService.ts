import type { Types } from "mongoose";
import { ConflictError } from "../lib/errors.js";
import { isFontCodepoint } from "../lib/codepoint.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";

const FIRST_CODEPOINT = 0xe000;
const LAST_CODEPOINT = 0xf8ff;

// Atomically reserves the next upload codepoint. Manual edits never advance this counter.
export async function allocateNextCodepoint(projectId: Types.ObjectId): Promise<string> {
  const project = await Project.findById(projectId).select({ uploadCodepointHighWatermark: 1 }).lean();
  if (!project) throw new ConflictError("The project is no longer available.");

  // Seed legacy projects from the most recently created icon, rather than the numerically largest codepoint: users may have edited older icons by hand.
  if (project.uploadCodepointHighWatermark == null) {
    const icons = await Icon.find({ projectId }).select({ codepoint: 1 }).sort({ createdAt: -1, _id: -1 }).lean();
    const lastAssigned = icons.find((icon) => icon.codepoint && isFontCodepoint(icon.codepoint))?.codepoint;
    const initial = lastAssigned ? Number.parseInt(lastAssigned, 16) : FIRST_CODEPOINT;
    await Project.updateOne({ _id: projectId, $or: [{ uploadCodepointHighWatermark: { $exists: false } }, { uploadCodepointHighWatermark: null }] }, { $max: { uploadCodepointHighWatermark: initial } });
  }

  const updated = await Project.findOneAndUpdate(
    { _id: projectId, uploadCodepointHighWatermark: { $lt: LAST_CODEPOINT } },
    { $inc: { uploadCodepointHighWatermark: 1 } },
    { returnDocument: "after" },
  ).select({ uploadCodepointHighWatermark: 1 }).lean();
  const reserved = updated?.uploadCodepointHighWatermark;
  if (reserved == null) throw new ConflictError("The Private Use Area has no new characters left. Manually edit an icon codepoint to reuse a character.");
  return reserved.toString(16).toUpperCase().padStart(4, "0");
}
