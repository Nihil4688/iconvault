export const MIN_ICON_SIZE = 16;
export const MAX_ICON_SIZE = 96;
export const DEFAULT_ICON_SIZE = 40;

// "" means the default colour (the theme's text colour). Three solid swatches (white, black, blue); any other colour comes from the picker. Choosing the selected swatch again returns to the default.
export const ICON_COLORS: { value: string; label: string }[] = [
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#3b82f6", label: "Blue" },
];

export type IconAppearance = { size: number; color: string };

export const DEFAULT_APPEARANCE: IconAppearance = { size: DEFAULT_ICON_SIZE, color: "" };

export function clampIconSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ICON_SIZE;
  return Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, Math.round(value)));
}

export function isIconColor(value: unknown): value is string {
  return typeof value === "string" && (value === "" || /^#[0-9a-fA-F]{6}$/.test(value));
}
