// Controls above the icon list: folder-specific preview size and colour, sort (an icon with a menu), a More menu (preview background) and grid or list view in one row, with search first, the "select all" checkbox  and (for editors) the Upload icons menu, which can be placed into the project header.
import { ArrowUpDown, LayoutGrid, List, Minus, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { ICON_COLORS, MAX_ICON_SIZE, MIN_EDITABLE_ICON_SIZE, clampIconSizeToRange, stepIconSize, type IconAppearance } from "../../lib/iconAppearance";
import DropdownSelect from "../ui/DropdownSelect";
import UploadButton from "./UploadButton";

export type IconSort = "newest" | "oldest" | "name" | "name-desc" | "largest";
export type IconView = "grid" | "list";

type IconToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  sort: IconSort;
  onSort: (sort: IconSort) => void;
  view: IconView;
  onView: (view: IconView) => void;
  appearance: IconAppearance;
  onAppearance: (change: Partial<IconAppearance>) => void;
  appearanceScope: "all" | "folder";
  // When set, the Upload icons button is placed in the project header instead of in this toolbar.
  actionsHost?: HTMLElement | null;
  canAdd: boolean;
  onUpload: () => void;
  disabled?: boolean;
  appearanceDisabled?: boolean;
};

const SORT_LABELS: Record<IconSort, string> = { newest: "Newest", oldest: "Oldest", name: "Name A–Z", "name-desc": "Name Z–A", largest: "Largest" };

export default function IconToolbar({ search, onSearch, sort, onSort, view, onView, appearance, onAppearance, appearanceScope, actionsHost, canAdd, onUpload, disabled = false, appearanceDisabled = false }: IconToolbarProps) {
  // The size shows as plain text until the user clicks it; then it becomes an editable field that keeps the raw
  // text while typing and only commits a clamped value on blur or Enter.
  const [sizeText, setSizeText] = useState(String(appearance.size));
  const [editingSize, setEditingSize] = useState(false);
  const sizeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setSizeText(String(appearance.size)), [appearance.size]);
  useEffect(() => {
    if (editingSize) sizeInputRef.current?.select();
  }, [editingSize]);

  const parsedSize = Number.parseInt(sizeText, 10);
  // While typing, flag a value that is out of range (e.g. 120) so the box turns red and a message shows.
  const sizeInvalid = sizeText.trim() !== "" && (Number.isNaN(parsedSize) || parsedSize < MIN_EDITABLE_ICON_SIZE || parsedSize > MAX_ICON_SIZE);

  function commitSize(raw: string) {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isNaN(parsed) ? appearance.size : clampIconSizeToRange(parsed);
    setSizeText(String(next));
    setEditingSize(false);
    if (next !== appearance.size) onAppearance({ size: next });
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <UploadButton onClick={onUpload} />
    </div>
  );
  const swatch = "h-5 w-5 rounded-full border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="space-y-3">
      <fieldset disabled={disabled} className={cn("flex min-w-0 flex-wrap items-center gap-4 border-0 p-0", disabled && "opacity-50")}>
        <legend className="sr-only">Icon Browsing Controls</legend>
        <div className="relative min-w-48 max-w-xs flex-1">
          <label htmlFor="icon-search" className="sr-only">
            Search Icons
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="icon-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by Name or Tag"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#1555E0] focus:shadow-[0_0_0_3px_rgba(21,85,224,0.2)] focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Icon Toolbar Actions" className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <fieldset disabled={appearanceDisabled} aria-describedby="appearance-scope-help" className={cn("flex items-center gap-2 border-0 p-0", appearanceDisabled && "opacity-50")}>
            <legend className="sr-only">Folder Appearance</legend>
            <div role="group" aria-label="Icon Size" className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2">
                  <button type="button" aria-label="Smaller Icons" disabled={appearance.size <= MIN_EDITABLE_ICON_SIZE} onClick={() => onAppearance({ size: stepIconSize(appearance.size, -1) })} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring">
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <input type="range" aria-label="Icon Size in Pixels" min={MIN_EDITABLE_ICON_SIZE} max={MAX_ICON_SIZE} step={1} value={appearance.size} onChange={(event) => onAppearance({ size: clampIconSizeToRange(Number(event.target.value)) })} className="w-20 accent-[hsl(var(--primary))]" />
                  <button type="button" aria-label="Larger Icons" disabled={appearance.size >= MAX_ICON_SIZE} onClick={() => onAppearance({ size: stepIconSize(appearance.size, 1) })} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring">
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {editingSize ? (
                    <input
                      ref={sizeInputRef}
                      type="number"
                      inputMode="numeric"
                      aria-label="Icon Size in Pixels"
                      aria-invalid={sizeInvalid}
                      aria-describedby={sizeInvalid ? "icon-size-error" : undefined}
                      min={MIN_EDITABLE_ICON_SIZE}
                      max={MAX_ICON_SIZE}
                      step={1}
                      value={sizeText}
                      onChange={(event) => setSizeText(event.target.value)}
                      onBlur={(event) => commitSize(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitSize(event.currentTarget.value);
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setSizeText(String(appearance.size));
                          setEditingSize(false);
                        }
                      }}
                      className={cn(
                        "w-10 border-0 border-b bg-transparent text-center text-sm tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        sizeInvalid ? "border-destructive text-destructive" : "border-foreground text-foreground",
                      )}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label="Edit icon size in pixels"
                      onClick={() => setEditingSize(true)}
                      className="w-10 text-center text-sm tabular-nums text-foreground"
                    >
                      {appearance.size}
                    </button>
                  )}
                  <span aria-hidden="true" className="text-sm text-muted-foreground">px</span>
                </div>
              </div>
              {sizeInvalid && (
                <p id="icon-size-error" className="text-xs text-destructive">
                  Maximum size is {MAX_ICON_SIZE}px
                </p>
              )}
            </div>
            <div role="group" aria-label="Icon Colour" className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3">
              <span
                role="img"
                aria-label={`Selected icon color: ${appearance.color || "default"}`}
                className={cn(swatch, "flex items-center justify-center ring-2 ring-primary ring-offset-2 ring-offset-background")}
                style={{ backgroundColor: appearance.color || "hsl(var(--foreground))" }}
              >
              </span>
              <span aria-hidden="true" className="h-6 border-l border-border" />
              {ICON_COLORS.map((color) => (
                <button key={color.value} type="button" aria-label={color.label} title={appearance.color === color.value ? `${color.label} (Click Again for the Default Colour)` : color.label} aria-pressed={appearance.color === color.value} onClick={() => onAppearance({ color: appearance.color === color.value ? "" : color.value })} className={swatch} style={{ backgroundColor: color.value }} />
              ))}
              <label className={cn(swatch, "relative cursor-pointer overflow-hidden has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring")} style={{ background: "conic-gradient(#ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)" }} title="More Colours">
                <span className="sr-only">More Colours</span>
                <input type="color" value={appearance.color || "#3b82f6"} onChange={(event) => onAppearance({ color: event.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
            </div>
          </fieldset>
          <p id="appearance-scope-help" className={cn("text-xs text-muted-foreground", !appearanceDisabled && "sr-only")}>
            {appearanceDisabled ? "Select a folder to customize its icons." : appearanceScope === "all" ? "Changes apply to all icons." : "Changes apply only to icons in this folder."}
          </p>
          <DropdownSelect
            label="Sort By"
            value={sort}
            options={(Object.keys(SORT_LABELS) as IconSort[]).map((value) => ({ value, label: SORT_LABELS[value] }))}
            onChange={(value) => onSort(value as IconSort)}
            title={`Sort: ${SORT_LABELS[sort]}`}
            showChevron={false}
            triggerClassName="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowUpDown aria-hidden="true" className="h-4 w-4" />
          </DropdownSelect>
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
      </fieldset>

      {canAdd && (actionsHost ? createPortal(actions, actionsHost) : <div className="flex justify-end">{actions}</div>)}
    </div>
  );
}