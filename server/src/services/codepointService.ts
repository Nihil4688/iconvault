import type { Types } from "mongoose";
import { ConflictError } from "../lib/errors.js";
import { isFontCodepoint } from "../lib/codepoint.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";

const FIRST_CODEPOINT = 0xe000;
const LAST_CODEPOINT = 0xf8ff;

// Atomically reserves the next upload codepoint. Manual edits never advance this counter.
export async function allocateNextCodepoint(projectId: Types.ObjectId): Promise<string> {
  return allocateNextCodepoints(projectId, 1).then((values) => values[0] as string);
}

// Reserves a contiguous block of `count` codepoints in one round-trip; the first reserved value is the smallest. Throws when not enough Private Use Area characters remain.
export async function allocateNextCodepoints(projectId: Types.ObjectId, count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
  const project = await Project.findById(projectId).select({ uploadCodepointHighWatermark: 1 }).lean();
  if (!project) throw new ConflictError("The project is no longer available.");

  // Seed legacy projects from the most recently created icon, rather than the numerically largest codepoint: users may have edited older icons by hand.
  if (project.uploadCodepointHighWatermark == null) {
    const icons = await Icon.find({ projectId }).select({ codepoint: 1 }).sort({ createdAt: -1, _id: -1 }).lean();
    const lastAssigned = icons.find((icon) => icon.codepoint && isFontCodepoint(icon.codepoint))?.codepoint;
    const initial = lastAssigned ? Number.parseInt(lastAssigned, 16) : FIRST_CODEPOINT;
    await Project.updateOne({ _id: projectId, $or: [{ uploadCodepointHighWatermark: { $exists: false } }, { uploadCodepointHighWatermark: null }] }, { $max: { uploadCodepointHighWatermark: initial } });
  }

  const maxStart = LAST_CODEPOINT - count;
  const updated = await Project.findOneAndUpdate(
    { _id: projectId, uploadCodepointHighWatermark: { $lte: maxStart } },
    { $inc: { uploadCodepointHighWatermark: count } },
    { returnDocument: "before" },
  ).select({ uploadCodepointHighWatermark: 1 }).lean();
  const start = (updated?.uploadCodepointHighWatermark ?? maxStart) + 1;
  if (start > LAST_CODEPOINT) throw new ConflictError("The Private Use Area has no new characters left. Manually edit an icon codepoint to reuse a character.");
  const out: string[] = new Array(count);
  for (let i = 0; i < count; i += 1) out[i] = (start + i).toString(16).toUpperCase().padStart(4, "0");
  return out;
}
