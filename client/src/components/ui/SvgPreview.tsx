// Shows an icon from its SVG markup at a given size. The markup is stored already cleaned by the server (scripts, event handlers, images and external references are removed), so it is safe to place inline; inline is needed so `currentColor` icons follow the text colour and the theme. As a second layer the box clips and contains its content (nothing can draw outside it), and the ids inside are renamed per preview.
import { useId, useMemo } from "react";
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
};

export default function SvgPreview({ svg, size = 32, className, label, color }: SvgPreviewProps) {
  // Every preview gets its own ids, so two icons on one page never take each other's gradients or clip paths.
  const prefix = `sv${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const markup = useMemo(() => {
    const namespaced = namespaceSvgIds(svg, prefix);
    return color ? applySvgColor(namespaced, color) : namespaced;
  }, [svg, prefix, color]);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // `fill-current` lets unstyled SVG shapes follow the theme; a chosen preview colour is applied to explicit fills and strokes too.
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden fill-current [contain:layout_paint] text-foreground [&>svg]:h-full [&>svg]:w-full", className)}
      style={{ width: size, height: size, ...(color ? { color } : undefined) }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
