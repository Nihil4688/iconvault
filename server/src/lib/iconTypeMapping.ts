// Icon type mapping based on SVG Conversion Matrix.
// Defines which icon types support color changes and which preserve original colors.

export type IconType =
  | "single-color"
  | "multi-color"
  | "gradient-linear"
  | "gradient-radial"
  | "fill-only"
  | "stroke-only"
  | "fill-stroke"
  | "path-based"
  | "shape-based"
  | "compound-path"
  | "grouped"
  | "nested-group"
  | "text-based"
  | "font-based"
  | "outlined-text"
  | "transform"
  | "clippath"
  | "mask"
  | "pattern"
  | "filter"
  | "drop-shadow"
  | "blur-effect"
  | "opacity"
  | "blend-modes"
  | "symbols"
  | "use-references"
  | "sprite-format"
  | "inline"
  | "external"
  | "responsive"
  | "fixed-size"
  | "embedded-css"
  | "inline-styles"
  | "class-based-styles"
  | "animated-smil"
  | "animated-css"
  | "animated-javascript"
  | "embedded-raster"
  | "external-image"
  | "logo"
  | "monochrome"
  | "duotone"
  | "illustration"
  | "brand-logo"
  | "unknown";

// Icon types that CAN have colors changed (✓ in Excel matrix)
export const COLORIZABLE_ICON_TYPES: Set<IconType> = new Set([
  "single-color",
  "multi-color",
  "fill-only",
  "stroke-only",
  "fill-stroke",
  "path-based",
  "shape-based",
  "compound-path",
  "grouped",
  "nested-group",
  "text-based",
  "font-based",
  "outlined-text",
  "transform",
  "opacity",
  "symbols",
  "use-references",
  "sprite-format",
  "inline",
  "external",
  "responsive",
  "fixed-size",
  "embedded-css",
  "inline-styles",
  "class-based-styles",
  "logo",
  "monochrome",
  "duotone",
  "illustration",
  "brand-logo",
]);

// Icon types that CANNOT have colors changed (✗ in Excel matrix)
export const NON_COLORIZABLE_ICON_TYPES: Set<IconType> = new Set([
  "gradient-linear",
  "gradient-radial",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "drop-shadow",
  "blur-effect",
  "blend-modes",
  "animated-smil",
  "animated-css",
  "animated-javascript",
  "embedded-raster",
  "external-image",
]);

/**
 * Determines if an icon type supports color changes.
 * Returns true if color can be changed, false if original colors must be preserved.
 */
export function canChangeColor(iconType: IconType): boolean {
  return COLORIZABLE_ICON_TYPES.has(iconType);
}

/**
 * Determines if an icon can have its color changed based on SVG features.
 * Based on the SVG Conversion Matrix, icons with certain features cannot support color changes.
 */
export function canChangeIconColor(svgInfo: {
  hasGradient: boolean;
  hasClipPath: boolean;
  hasMask: boolean;
  hasPattern: boolean;
  hasFilter: boolean;
  hasDropShadow: boolean;
  hasBlendModes: boolean;
  isAnimated: boolean;
  hasEmbeddedRaster: boolean;
  hasExternalImage: boolean;
}): boolean {
  // Only the types the matrix marks as not colour-changeable (filter, shadow, blur, blend, animation, raster, external image).
  // Gradient, ClipPath, Mask and Pattern are colour-changeable per the matrix.
  if (svgInfo.hasFilter) return false;        // SVG with Filter / Drop Shadow / Blur
  if (svgInfo.hasDropShadow) return false;    // SVG with Drop Shadow
  if (svgInfo.hasBlendModes) return false;    // SVG with Blend Modes
  if (svgInfo.isAnimated) return false;       // Animated SVG (SMIL, CSS, or JavaScript)
  if (svgInfo.hasEmbeddedRaster) return false; // SVG with Embedded Raster Image
  if (svgInfo.hasExternalImage) return false; // SVG with External Image Reference

  // All other icon types can be colorized
  return true;
}
