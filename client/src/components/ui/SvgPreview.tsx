// Shows an icon from its SVG markup at a given size. The markup is stored already cleaned by the server (scripts, event handlers, images and external references are removed), so it is safe to place inline; inline is needed so `currentColor` icons follow the text colour and the theme. As a second layer the box clips and contains its content (nothing can draw outside it), and the ids inside are renamed per preview.
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "../../lib/cn";
import { applySvgColor } from "../../lib/svgColor";
import { namespaceSvgIds } from "../../lib/svgIds";

type SvgPreviewProps = {
  svg: string;
  // Edge length in pixels.
  size?: number;
  className?: string;
  // Give a label when the icon is the only thing conveying meaning; otherwise it is hidden from screen readers.
  label?: string;
  // Preview-only colour override. An empty colour keeps the theme's text colour.
  color?: string;
  // Whether this icon supports color changes. When false, color changes are ignored and original SVG colors are preserved.
  canBeColorized?: boolean;
  // Move the drawing to the middle of the box without changing its size (font glyphs often sit off-centre inside their glyph box).
  center?: boolean;
};

export default function SvgPreview({ svg, size = 32, className, label, color, canBeColorized = true, center = false }: SvgPreviewProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Every preview gets its own ids, so two icons on one page never take each other's gradients or clip paths.
  const prefix = `sv${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const markup = useMemo(() => {
    const namespaced = namespaceSvgIds(svg, prefix);
    // Only apply color if the icon can be colorized and a color is provided
    return color && canBeColorized ? applySvgColor(namespaced, color) : namespaced;
  }, [svg, prefix, color, canBeColorized]);

  useLayoutEffect(() => {
    const element = ref.current?.querySelector("svg");
    // getBBox needs a rendering engine (not available in jsdom).
    if (!center || !element || typeof element.getBBox !== "function") return;
    const view = element.viewBox.baseVal;
    const box = element.getBBox();
    if (!view || view.width <= 0 || view.height <= 0 || box.width <= 0 || box.height <= 0) return;
    // A square view centred on the drawing. Its side is the original width, which is what set the icon's scale before, so the icon keeps its size; it only grows when the drawing would not fit.
    const side = Math.max(view.width, box.width, box.height);
    element.setAttribute("viewBox", `${box.x + box.width / 2 - side / 2} ${box.y + box.height / 2 - side / 2} ${side} ${side}`);
  }, [center, markup]);

  return (
    <span
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // `fill-current` lets unstyled SVG shapes follow the theme; a chosen preview colour is applied to explicit fills and strokes too.
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden fill-current [contain:layout_paint] text-foreground [&>svg]:h-full [&>svg]:w-full", className)}
      style={{ width: size, height: size, ...(color && canBeColorized ? { color } : undefined) }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
