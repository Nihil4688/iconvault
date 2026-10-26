// Colour helpers for project accent colours: pick text that stays readable on a given background.

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// WCAG relative luminance of a #rrggbb colour.
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// White or near-black, whichever reads better on `background`. Falls back to white for anything that is not #rrggbb.
export function readableTextOn(background: string): "#ffffff" | "#0a0a0b" {
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) return "#ffffff";
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#0a0a0b") ? "#ffffff" : "#0a0a0b";
}
