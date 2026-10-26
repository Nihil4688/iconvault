// Deleting icons also deletes their saved versions. MongoDB has no foreign keys, so this is done here, versions first so a failure never leaves versions pointing at nothing.
import type { QueryFilter } from "mongoose";
import Icon, { type IconDoc } from "../models/Icon.js";
import IconVersion from "../models/IconVersion.js";

// Permanently deletes every icon matching the filter, with its versions. Returns how many icons were deleted.
export async function deleteIconsAndVersions(filter: QueryFilter<IconDoc>): Promise<number> {
  const ids = (await Icon.find(filter).select({ _id: 1 }).lean()).map((icon) => icon._id);
  if (ids.length === 0) return 0;
  await IconVersion.deleteMany({ iconId: { $in: ids } });
  const result = await Icon.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
}
