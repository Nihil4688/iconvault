// Hands a font that was just built on the Icons screen ("Build font" on the bulk bar) to the Font page that opens next, so the page shows the result at once instead of building it a second time. It lives in memory only, for one navigation: a reload or a later visit starts from the page's own settings. The preview font stays registered in the page while it waits.
import type { FontBuildResult } from "../api/types";
import { unloadPreviewFont } from "./fontPreview";

export type CachedBuild = { projectId: string; build: FontBuildResult; family: string; loaded: boolean; at: number };

const MAX_AGE_MS = 2 * 60_000;
let cached: CachedBuild | null = null;

export function cacheBuild(entry: Omit<CachedBuild, "at">): void {
  // A build nobody picked up is dropped, with its preview font.
  if (cached) unloadPreviewFont(cached.family);
  cached = { ...entry, at: Date.now() };
}

// Looks at the waiting build without taking it (safe to call twice, as React may while rendering).
export function peekCachedBuild(projectId: string): CachedBuild | null {
  return cached && cached.projectId === projectId && Date.now() - cached.at < MAX_AGE_MS ? cached : null;
}

// Forgets the waiting build once the page has taken it. The page now owns its preview font.
export function clearCachedBuild(): void {
  cached = null;
}
