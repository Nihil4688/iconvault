// Controls above the icon list: the preview size / colour / style, sort (an icon with a menu), a More menu (preview background) and grid or list view in one row, with search first, the "select all" checkbox  and (for editors) the Upload icons menu, which can be placed into the project header.
import { ArrowUpDown, Box, Copy, Eye, LayoutGrid, List, Minus, Plus, Search, Square } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { ICON_COLORS, ICON_STYLES, ICON_STYLE_HINTS, ICON_STYLE_LABELS, MAX_ICON_SIZE, MIN_ICON_SIZE, clampIconSize, type IconAppearance, type IconStyle } from "../../lib/iconAppearance";
import type { Surface } from "../../lib/previewSurface";
import { Button } from "../ui/Button";
import MoreMenu from "./MoreMenu";
import UploadMenu, { type UploadKind } from "./UploadMenu";

export type IconSort = "newest" | "oldest" | "name" | "name-desc" | "largest";
export type IconView = "grid" | "list";

type IconToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  sort: IconSort;
  onSort: (sort: IconSort) => void;
  view: IconView;
  onView: (view: IconView) => void;
  surface: Surface;
  onSurface: (surface: Surface) => void;
  appearance: IconAppearance;
  onAppearance: (change: Partial<IconAppearance>) => void;
  // When set, the Upload icons and From Another Project buttons are placed there (the project header) instead of in this toolbar.
  actionsHost?: HTMLElement | null;
  canAdd: boolean;
  onUpload: (kind: UploadKind) => void;
};

const SORT_LABELS: Record<IconSort, string> = { newest: "Newest", oldest: "Oldest", name: "Name A–Z", "name-desc": "Name Z–A", largest: "Largest" };
const STYLE_ICONS: Record<IconStyle, typeof Eye> = { natural: Eye, flat: Square, wireframe: Box };

export default function IconToolbar({ search, onSearch, sort, onSort, view, onView, surface, onSurface, appearance, onAppearance, actionsHost, canAdd, onUpload }: IconToolbarProps) {


  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <UploadMenu onSelect={onUpload} />
      <Button size="sm" className="h-9" icon={<Copy aria-hidden="true" className="h-4 w-4" />} onClick={() => onUpload("copy")}>
        From Another Project
      </Button>
    </div>
  );
  const swatch = "h-5 w-5 rounded-full border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 min-[1366px]:flex-nowrap">
        <div className="relative min-w-48 flex-1">
          <label htmlFor="icon-search" className="sr-only">
            Search icons
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="icon-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by name or tag"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </div>
        <div role="group" aria-label="Icon size" className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2">
          <button type="button" aria-label="Smaller icons" disabled={appearance.size <= MIN_ICON_SIZE} onClick={() => onAppearance({ size: clampIconSize(appearance.size - 4) })} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring">
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <input type="range" aria-label="Icon size in pixels" min={MIN_ICON_SIZE} max={MAX_ICON_SIZE} step={2} value={appearance.size} onChange={(event) => onAppearance({ size: clampIconSize(Number(event.target.value)) })} className="w-20 accent-[hsl(var(--primary))]" />
          <button type="button" aria-label="Larger icons" disabled={appearance.size >= MAX_ICON_SIZE} onClick={() => onAppearance({ size: clampIconSize(appearance.size + 4) })} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring">
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
          <output className="w-10 text-right font-mono text-xs text-muted-foreground">{appearance.size}px</output>
        </div>
        <div role="group" aria-label="Icon colour" className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3">
          {ICON_COLORS.map((color) => (
            <button key={color.value} type="button" aria-label={color.label} title={appearance.color === color.value ? `${color.label} (click again for the default colour)` : color.label} aria-pressed={appearance.color === color.value} onClick={() => onAppearance({ color: appearance.color === color.value ? "" : color.value })} className={cn(swatch, appearance.color === color.value && "ring-2 ring-primary ring-offset-2 ring-offset-background")} style={{ backgroundColor: color.value }} />
          ))}
          <label className={cn(swatch, "relative cursor-pointer overflow-hidden has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring", appearance.color !== "" && !ICON_COLORS.some((color) => color.value === appearance.color) && "ring-2 ring-primary ring-offset-2 ring-offset-background")} style={{ background: "conic-gradient(#ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)" }} title="More colours">
            <span className="sr-only">More colours</span>
            <input type="color" value={appearance.color || "#3b82f6"} onChange={(event) => onAppearance({ color: event.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </div>
        <div role="group" aria-label="Icon style" className="inline-flex h-9 items-center rounded-lg border border-input bg-muted p-0.5">
          {ICON_STYLES.map((value) => {
            const Icon = STYLE_ICONS[value];
            return (
              <button key={value} type="button" aria-pressed={appearance.style === value} title={ICON_STYLE_HINTS[value]} onClick={() => onAppearance({ style: value })} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring", appearance.style === value && "bg-background text-foreground shadow-sm ring-1 ring-border")}>
                <Icon aria-hidden="true" className="h-4 w-4" />
                {ICON_STYLE_LABELS[value]}
              </button>
            );
          })}
        </div>
        <label className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring" title={`Sort: ${SORT_LABELS[sort]}`}>
          <ArrowUpDown aria-hidden="true" className="h-4 w-4" />
          <select aria-label="Sort by" value={sort} onChange={(event) => onSort(event.target.value as IconSort)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
            {(Object.keys(SORT_LABELS) as IconSort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <MoreMenu surface={surface} onSurface={onSurface} />
        <div role="group" aria-label="View" className="inline-flex h-9 items-center rounded-lg border border-input bg-muted p-0.5">
          {(
            [
              ["grid", "Grid view", LayoutGrid],
              ["list", "List view", List],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              title={label}
              onClick={() => onView(value)}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                view === value && "bg-background text-foreground shadow-sm ring-1 ring-border",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {canAdd && (actionsHost ? createPortal(actions, actionsHost) : <div className="flex justify-end">{actions}</div>)}
    </div>
  );
}
