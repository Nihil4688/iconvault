// One icon in the grid: a checkbox to select it, a button that opens it, a preview on the chosen surface, its name, Unicode codepoint and any font-conversion warnings. Editors can drag it (or the whole selection) onto a folder.
import { setDraggedIcons } from "../../lib/dragIcons";
import type { IconItem } from "../../api/types";
import { cn } from "../../lib/cn";
import type { IconAppearance } from "../../lib/iconAppearance";
import { iconWarnings } from "../../lib/iconInfo";
import { surfaceClass, surfaceStyle, type Surface } from "../../lib/previewSurface";
import Badge from "../ui/Badge";
import SvgPreview from "../ui/SvgPreview";

type IconCardProps = {
  icon: IconItem;
  selected: boolean;
  surface: Surface;
  appearance: IconAppearance;
  canDrag: boolean;
  // The ids to carry when this card is dragged: the whole selection if this icon is part of it.
  dragIds: () => string[];
  onToggle: () => void;
  onOpen: () => void;
};

export default function IconCard({ icon, selected, surface, appearance, canDrag, dragIds, onToggle, onOpen }: IconCardProps) {
  const warnings = iconWarnings(icon);
  return (
    <li
      draggable={canDrag}
      onDragStart={(event) => setDraggedIcons(event.dataTransfer, dragIds())}
      className={cn("group relative rounded-xl border bg-card text-card-foreground transition-shadow hover:shadow-md", selected ? "border-primary ring-2 ring-primary" : "border-border")}
    >
      <label className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-card/90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${icon.name}`} className="h-4 w-4 accent-[hsl(var(--primary))]" />
      </label>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${icon.name}`}
        className="flex w-full flex-col items-center gap-2 rounded-t-xl p-3 pb-1 text-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className={cn("flex w-full items-center justify-center rounded-lg", surfaceClass(surface))} style={{ ...surfaceStyle(surface), minHeight: Math.max(96, appearance.size + 32) }}>
          <SvgPreview svg={icon.svg ?? ""} size={appearance.size} color={appearance.color} iconStyle={appearance.style} />
        </span>
        <span className="w-full truncate text-sm font-medium">{icon.name}</span>
      </button>
      {/* Outside the button, so its visible text is just the name and matches its accessible name ("Open <name>"). */}
      <div className="flex flex-col items-center gap-2 px-3 pb-3 text-center">
        <span className="font-mono text-xs text-muted-foreground">{icon.codepoint ? `U+${icon.codepoint}` : "No codepoint"}</span>
        {warnings.length > 0 && (
          <span className="flex flex-wrap justify-center gap-1" title="These will not convert cleanly to an icon font.">
            {warnings.map((warning) => (
              <Badge key={warning} className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                {warning}
              </Badge>
            ))}
          </span>
        )}
      </div>
    </li>
  );
}
