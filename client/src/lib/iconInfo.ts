// Small facts about an icon that several screens show.
import type { IconItem } from "../api/types";

// What would not convert cleanly into an icon font (strokes, gradients and text need to become filled outlines).
export function iconWarnings(icon: Pick<IconItem, "hasStroke" | "hasGradient" | "hasText">): string[] {
  return [icon.hasStroke ? "Stroke" : null, icon.hasGradient ? "Gradient" : null, icon.hasText ? "Text" : null].filter((warning): warning is string => warning !== null);
}
