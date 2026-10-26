// The checklist for choosing which icons go into a sprite or font: every icon of the project with a checkbox, a search, a folder filter, a grouped or flat list, "All" and "Selected" views, select and deselect for everything shown or for one folder, and a count. It starts with the icons that were selected on the Icons screen (or all of them). Confirming hands the chosen icon ids back; nothing is built here.
import { ChevronDown, ChevronRight, FolderOpen, Layers, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { FolderWithCount, IconItem } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { cn } from "../../lib/cn";
import { buildFolderTree, descendantIds, flattenFolderTree, folderPath } from "../../lib/folderTree";
import { formatBytes, pluralize } from "../../lib/format";
import { loadAllIcons } from "../../lib/loadAllIcons";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import SvgPreview from "../ui/SvgPreview";

export type ChecklistMode = "sprite" | "font";
const MAX_FONT_ICONS = 1000;

type IconChecklistDialogProps = {
  open: boolean;
  mode: ChecklistMode;
  projectId: string;
  folders: FolderWithCount[];
  // The ids to tick at the start; null ticks every icon.
  initialIds: string[] | null;
  onClose: () => void;
  onConfirm: (iconIds: string[]) => void;
};

export default function IconChecklistDialog({ open, mode, projectId, folders, initialIds, onClose, onConfirm }: IconChecklistDialogProps) {
  const title = mode === "font" ? "Choose icons for the font" : "Choose icons for the sprite";
  return (
    <Dialog open={open} onClose={onClose} title={title} description="Tick the icons to include. You can select or deselect whole folders at once." size="lg">
      <Loader mode={mode} projectId={projectId} folders={folders} initialIds={initialIds} onClose={onClose} onConfirm={onConfirm} />
    </Dialog>
  );
}

function Loader(props: Omit<IconChecklistDialogProps, "open">) {
  const icons = useResource(`checklist:${props.projectId}`, () => loadAllIcons(props.projectId));
  if (icons.error && !icons.data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-center">
        <p className="font-medium text-destructive">{icons.error.message}</p>
        <Button className="mt-3" onClick={icons.reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (!icons.data) return <div aria-busy="true" aria-label="Loading icons" className="h-48 animate-pulse rounded-xl bg-muted" />;
  return <Checklist {...props} icons={icons.data} />;
}

type Group = { key: string; label: string; icons: IconItem[] };
type View = "all" | "selected";

function Checklist({ mode, folders, icons, initialIds, onClose, onConfirm }: Omit<IconChecklistDialogProps, "open" | "projectId"> & { icons: IconItem[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialIds ? icons.filter((icon) => initialIds.includes(icon.id)).map((icon) => icon.id) : icons.map((icon) => icon.id)));
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [grouped, setGrouped] = useState(true);
  const [view, setView] = useState<View>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const folderOptions = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders]);

  // The icons that match the search, folder filter and view.
  const visible = useMemo(() => {
    const text = search.trim().toLowerCase();
    const inFolder = folderFilter === "all" ? null : folderFilter === "root" ? new Set<string | null>([null]) : new Set<string | null>([folderFilter, ...descendantIds(folders, folderFilter)]);
    return icons.filter((icon) => (!inFolder || inFolder.has(icon.folderId)) && (view === "all" || picked.has(icon.id)) && (!text || `${icon.name} ${icon.slug} ${icon.tags.join(" ")}`.toLowerCase().includes(text)));
  }, [icons, folders, search, folderFilter, view, picked]);

  const groups = useMemo<Group[]>(() => {
    const byFolder = new Map<string | null, IconItem[]>();
    for (const icon of visible) byFolder.set(icon.folderId, [...(byFolder.get(icon.folderId) ?? []), icon]);
    const ordered: Group[] = folderOptions.filter((folder) => byFolder.has(folder.id)).map((folder) => ({ key: folder.id, label: folderPath(folders, folder.id), icons: byFolder.get(folder.id) as IconItem[] }));
    // Icons in a folder that no longer exists are shown with the uncategorized ones.
    const known = new Set(folderOptions.map((folder) => folder.id));
    const loose = visible.filter((icon) => icon.folderId === null || !known.has(icon.folderId));
    if (loose.length > 0) ordered.push({ key: "root", label: "Uncategorized", icons: loose });
    return ordered;
  }, [visible, folders, folderOptions]);

  const setMany = (ids: string[], checked: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const toggleOne = (id: string) => setMany([id], !picked.has(id));
  const toggleGroup = (key: string) => setCollapsed((current) => (current.has(key) ? new Set([...current].filter((k) => k !== key)) : new Set([...current, key])));
  const visibleIds = visible.map((icon) => icon.id);
  const count = picked.size;
  const tooMany = mode === "font" && count > MAX_FONT_ICONS;
  const noun = mode === "font" ? "font" : "sprite";

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        {mode === "font" ? "Icon font" : "SVG sprite"}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <label htmlFor="checklist-search" className="sr-only">
            Filter the checklist by icon name or tag
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id="checklist-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by icon name or tag" autoComplete="off" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring" />
        </div>
        <label htmlFor="checklist-folder" className="sr-only">
          Folder
        </label>
        <select id="checklist-folder" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring">
          <option value="all">All folders</option>
          <option value="root">Uncategorized</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {`${"  ".repeat(folder.depth)}${folder.name}`}
            </option>
          ))}
        </select>
        <div role="group" aria-label="View" className="inline-flex gap-1 rounded-lg border border-input bg-muted p-0.5">
          <button type="button" aria-pressed={grouped} onClick={() => setGrouped((value) => !value)} className={toggleClass(grouped)}>
            <Layers aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
            Group by folder
          </button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")} className={toggleClass(view === "all")}>
            All ({icons.length})
          </button>
          <button type="button" aria-pressed={view === "selected"} onClick={() => setView("selected")} className={toggleClass(view === "selected")}>
            Selected ({count})
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMany(visibleIds, true)} disabled={visibleIds.length === 0}>
            Select all ({visibleIds.length})
          </Button>
          <Button size="sm" onClick={() => setMany(visibleIds, false)} disabled={visibleIds.length === 0}>
            Deselect all
          </Button>
        </div>
        <p role="status" className="text-sm font-medium">
          <span className="text-primary">{count}</span> of {icons.length} icons selected for the {noun}
        </p>
      </div>

      <div className="mt-3 max-h-[min(24rem,50dvh)] space-y-3 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{icons.length === 0 ? "This project has no icons yet." : view === "selected" && !search && folderFilter === "all" ? "Nothing is selected." : "No icons match."}</p>
        ) : grouped ? (
          groups.map((group) => {
            const ids = group.icons.map((icon) => icon.id);
            const chosen = ids.filter((id) => picked.has(id)).length;
            const open = !collapsed.has(group.key);
            return (
              <section key={group.key} aria-label={group.label} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2">
                  <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`} className="rounded p-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                    {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
                  </button>
                  <TriCheckbox label={`Select all in ${group.label}`} checked={chosen === ids.length} indeterminate={chosen > 0 && chosen < ids.length} onChange={(checked) => setMany(ids, checked)} />
                  <FolderOpen aria-hidden="true" className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">({pluralize(ids.length, "icon")})</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {chosen} of {ids.length} selected
                  </span>
                  <Button size="sm" onClick={() => setMany(ids, chosen !== ids.length)}>
                    {chosen === ids.length ? "Deselect folder" : "Select folder"}
                  </Button>
                </div>
                {open && (
                  <ul className="grid gap-2 p-3 sm:grid-cols-2">
                    {group.icons.map((icon) => (
                      <Row key={icon.id} icon={icon} checked={picked.has(icon.id)} onToggle={() => toggleOne(icon.id)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((icon) => (
              <Row key={icon.id} icon={icon} checked={picked.has(icon.id)} onToggle={() => toggleOne(icon.id)} />
            ))}
          </ul>
        )}
      </div>

      {tooMany && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          A font can hold {MAX_FONT_ICONS} icons at most. Deselect some to continue.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">{count === 0 ? "Tick at least one icon." : `Ready to build with ${pluralize(count, "icon")}.`}</p>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} disabled={count === 0 || tooMany} onClick={() => onConfirm(icons.filter((icon) => picked.has(icon.id)).map((icon) => icon.id))}>
            Build {noun} ({pluralize(count, "icon")})
          </Button>
        </div>
      </div>
    </div>
  );
}

const toggleClass = (on: boolean) => cn("h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");

function Row({ icon, checked, onToggle }: { icon: IconItem; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <SvgPreview svg={icon.svg ?? ""} size={24} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{icon.name}</span>
          <span className="block text-xs text-muted-foreground">
            {icon.width}×{icon.height} · {formatBytes(icon.byteSize)}
          </span>
        </span>
      </label>
    </li>
  );
}

// A checkbox that can show "some of the group".
function TriCheckbox({ label, checked, indeterminate, onChange }: { label: string; checked: boolean; indeterminate: boolean; onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-[hsl(var(--primary))]"
    />
  );
}

