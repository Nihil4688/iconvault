// The background icons are previewed on. Many icons have fixed black fills that disappear on a dark theme, so the surface can be set independently of the theme.
import type { CSSProperties } from "react";

export const SURFACES = ["theme", "light", "dark", "checker"] as const;
export type Surface = (typeof SURFACES)[number];

export const SURFACE_LABELS: Record<Surface, string> = {
  theme: "Match theme",
  light: "Light",
  dark: "Dark",
  checker: "Checkerboard",
};

export function surfaceClass(surface: Surface): string {
  switch (surface) {
    case "light":
      return "bg-white text-neutral-900";
    case "dark":
      return "bg-neutral-900 text-white";
    case "checker":
      return "bg-white text-neutral-900";
    default:
      return "bg-muted text-foreground";
  }
}

// Grey squares for transparency, drawn with gradients so no image is needed.
export function surfaceStyle(surface: Surface): CSSProperties | undefined {
  if (surface !== "checker") return undefined;
  return {
    backgroundImage: "conic-gradient(#d4d4d8 25%, transparent 0 50%, #d4d4d8 0 75%, transparent 0)",
    backgroundSize: "12px 12px",
  };
}
