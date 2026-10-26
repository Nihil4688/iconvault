// Shows an icon from its SVG markup at a given size. The markup is stored already cleaned by the server (scripts, event handlers, images and external references are removed), so it is safe to place inline; inline is needed so `currentColor` icons follow the text colour and the theme. As a second layer the box clips and contains its content (nothing can draw outside it), and the ids inside are renamed per preview.
import { useId, useMemo } from "react";
import { cn } from "../../lib/cn";
import { iconStyleClass, type IconStyle } from "../../lib/iconAppearance";
import { namespaceSvgIds } from "../../lib/svgIds";

type SvgPreviewProps = {
  svg: string;
  // Edge length in pixels.
  size?: number;
  className?: string;
  // Give a label when the icon is the only thing conveying meaning; otherwise it is hidden from screen readers.
  label?: string;
  // Preview-only restyling (the Icons screen's colour and style choices). An empty colour keeps the theme's text colour.
  color?: string;
  iconStyle?: IconStyle;
};

export default function SvgPreview({ svg, size = 32, className, label, color, iconStyle = "natural" }: SvgPreviewProps) {
  // Every preview gets its own ids, so two icons on one page never take each other's gradients or clip paths.
  const prefix = `sv${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const markup = useMemo(() => namespaceSvgIds(svg, prefix), [svg, prefix]);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // `fill-current`: shapes that do not set their own fill (SVG then paints them black) take the text colour instead, so they stay visible in dark mode. Icons with their own fill or stroke keep it.
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden fill-current [contain:layout_paint] text-foreground [&>svg]:h-full [&>svg]:w-full", iconStyleClass(iconStyle), className)}
      style={{ width: size, height: size, ...(color ? { color } : undefined) }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
