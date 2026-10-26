// The workspace totals for the admin screens. `version` changes after something was deleted or moved, so the numbers are fetched again.
import { getAdminStats } from "../api/admin";
import { useResource } from "./useResource";

export function useAdminStats(version = 0) {
  return useResource(`admin-stats:${version}`, getAdminStats);
}
