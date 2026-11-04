export const ICON_SIZES = [12, 16, 20, 24, 32, 40, 48, 64, 80, 96] as const;
export const MIN_ICON_SIZE = ICON_SIZES[0];
export const MAX_ICON_SIZE = ICON_SIZES[ICON_SIZES.length - 1];
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
  return ICON_SIZES.reduce((closest, size) => (Math.abs(size - value) < Math.abs(closest - value) ? size : closest));
}

export function stepIconSize(value: number, direction: -1 | 1): number {
  const index = ICON_SIZES.findIndex((size) => size === clampIconSize(value));
  return ICON_SIZES[Math.max(0, Math.min(ICON_SIZES.length - 1, index + direction))];
}

export function isIconColor(value: unknown): value is string {
  return typeof value === "string" && (value === "" || /^#[0-9a-fA-F]{6}$/.test(value));
}
