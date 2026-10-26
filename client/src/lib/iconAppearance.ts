// How icons are drawn in the Icons screen: size, colour and style. This only changes the preview in this browser; the stored SVG is never touched.
export const ICON_STYLES = ["natural", "flat", "wireframe"] as const;
export type IconStyle = (typeof ICON_STYLES)[number];

export const ICON_STYLE_LABELS: Record<IconStyle, string> = {
  natural: "Natural",
  flat: "Flat",
  wireframe: "Wireframe",
};

export const ICON_STYLE_HINTS: Record<IconStyle, string> = {
  natural: "As designed",
  flat: "Solid shapes in one colour",
  wireframe: "Outlines only, in one colour",
};

export const MIN_ICON_SIZE = 16;
export const MAX_ICON_SIZE = 96;
export const DEFAULT_ICON_SIZE = 40;

// "" means the default colour (the theme's text colour). Three solid swatches (white, black, blue); any other colour comes from the picker. Choosing the selected swatch again returns to the default.
export const ICON_COLORS: { value: string; label: string }[] = [
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#3b82f6", label: "Blue" },
];

export type IconAppearance = { size: number; color: string; style: IconStyle };

export const DEFAULT_APPEARANCE: IconAppearance = { size: DEFAULT_ICON_SIZE, color: "", style: "natural" };

export function clampIconSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ICON_SIZE;
  return Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, Math.round(value)));
}

export function isIconColor(value: unknown): value is string {
  return typeof value === "string" && (value === "" || /^#[0-9a-fA-F]{6}$/.test(value));
}

// Classes that restyle every shape inside the inline SVG. `!` beats the SVG's own fill and stroke attributes.
export function iconStyleClass(style: IconStyle): string {
  switch (style) {
    case "flat":
      return "[&_*]:fill-current! [&_*]:stroke-none!";
    case "wireframe":
      return "[&_*]:fill-none! [&_*]:stroke-current! [&_*]:stroke-[1.5]!";
    default:
      return "";
  }
}
