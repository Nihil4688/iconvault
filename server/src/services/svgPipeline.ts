// The one entry point for turning uploaded markup into what gets stored: clean it, optionally optimize it, then re-read size and flags from the final markup (so they never go stale after optimizing).
import { inspectSvg, sanitizeSvg, type SvgInfo } from "./svgSanitizer.js";
import { optimizeSvg } from "./svgOptimizer.js";

export type PreparedSvg = SvgInfo & {
  svg: string;
  // Size of the markup that is stored, and of the clean markup before optimizing (to show savings).
  byteSize: number;
  originalByteSize: number;
};

export type PrepareOptions = {
  optimize?: boolean;
  removeDimensions?: boolean;
};

export function prepareSvg(raw: string | Buffer, options: PrepareOptions = {}): PreparedSvg {
  const clean = sanitizeSvg(raw);
  const originalByteSize = Buffer.byteLength(clean.svg, "utf8");

  if (options.optimize === false) {
    return { ...clean, byteSize: originalByteSize, originalByteSize };
  }

  const optimized = optimizeSvg(clean.svg, { removeDimensions: options.removeDimensions ?? true });
  if (optimized.svg === clean.svg) {
    return { ...clean, byteSize: originalByteSize, originalByteSize };
  }
  const info = inspectSvg(optimized.svg);
  return {
    ...info,
    svg: optimized.svg,
    byteSize: optimized.optimizedSize,
    originalByteSize,
  };
}
