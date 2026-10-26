// Shrinks clean SVG markup with SVGO 4. The ids are kept (cleanupIds off) so references keep working; the viewBox is kept by default in SVGO 4. xmlns is kept so downloaded files open on their own.
import { optimize, type Config } from "svgo";

export type OptimizeOptions = {
  multipass?: boolean;
  // Drop width/height so the icon scales to its container (the viewBox stays).
  removeDimensions?: boolean;
};

export type OptimizedSvg = {
  svg: string;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
};

export function optimizeSvg(svg: string, options: OptimizeOptions = {}): OptimizedSvg {
  const originalSize = Buffer.byteLength(svg, "utf8");

  const plugins: NonNullable<Config["plugins"]> = [
    { name: "preset-default", params: { overrides: { cleanupIds: false } } },
  ];
  if (options.removeDimensions) plugins.push("removeDimensions");

  try {
    const output = optimize(svg, { multipass: options.multipass !== false, plugins }).data;
    const optimizedSize = Buffer.byteLength(output, "utf8");
    return {
      svg: output,
      originalSize,
      optimizedSize,
      savingsPercent:
        originalSize > 0
          ? Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100))
          : 0,
    };
  } catch (err) {
    // An optimizer failure must not lose the icon: keep the clean original.
    console.warn("[svgo] Optimization failed, keeping the original:", err instanceof Error ? err.message : err);
    return { svg, originalSize, optimizedSize: originalSize, savingsPercent: 0 };
  }
}
