// Copy icons into this project from another project the user can see (their own or public ones): pick the project, tick the icons, choose a folder here and what to do when a name is taken.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Layers, Search } from "lucide-react";
import { copyIcons, listIcons } from "../../api/icons";
import { listProjects } from "../../api/projects";
import type { DuplicateStrategy, FolderWithCount, UploadSummary } from "../../api/types";
import { useDebounced } from "../../hooks/useDebounced";
import { useResource } from "../../hooks/useResource";
import { cn } from "../../lib/cn";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import SvgPreview from "../ui/SvgPreview";
import DropdownSelect from "../ui/DropdownSelect";
import FolderDropdownSelect from "./FolderDropdownSelect";

export type CopyFromProjectDialogProps = {
  open: boolean;
  targetProjectId: string;
  targetFolders: FolderWithCount[];
  defaultFolderId: string | null;
  onClose: () => void;
  onCopied: (summary: UploadSummary) => void;
};

const duplicateOptions: { value: DuplicateStrategy; label: string }[] = [
  { value: "rename", label: "Keep Both (Add a Number)" },
  { value: "replace", label: "Replace It (the Old One Is Kept as a Version)" },
  { value: "skip", label: "Skip" },
];

export default function CopyFromProjectDialog({ open, onClose, ...rest }: CopyFromProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Copy from Another Project" description="Pick icons from one of your projects or a public project." size="lg">
      <CopyFromProjectForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

export function CopyFromProjectForm({ targetProjectId, targetFolders, defaultFolderId, onClose, onCopied }: Omit<CopyFromProjectDialogProps, "open">) {
  const projects = useResource("copy-sources", () => listProjects({ scope: "all", status: "active", limit: 100 }));
  const sources = (projects.data?.projects ?? []).filter((p) => p.id !== targetProjectId);

  const [chosen, setChosen] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const sourceId = chosen || sources[0]?.id || "";
  const sourceOptions = sources.map((project) => ({
    value: project.id,
    label: `${project.name} (${project.access.canEdit ? "yours" : `by ${project.owner.displayName}`}) (${pluralize(project.iconCount, "icon")})`,
  }));
  const selectedSource = sourceOptions.find((option) => option.value === sourceId) ?? sourceOptions[0];
  const query = useDebounced(search.trim(), 300);
  const icons = useResource(sourceId ? `copy-icons:${sourceId}:${query}` : null, () => listIcons(sourceId, { sort: "name", limit: 200, ...(query ? { search: query } : {}) }));
  const shown = icons.data?.icons ?? [];

  // Ticks that belong to a project that is no longer chosen are ignored.
  const pickedHere = picked.filter((id) => shown.some((icon) => icon.id === id));
  const allShownPicked = shown.length > 0 && shown.every((icon) => pickedHere.includes(icon.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = pickedHere.length > 0 && !allShownPicked;
  }, [allShownPicked, pickedHere.length]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pickedHere.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await copyIcons(targetProjectId, { sourceProjectId: sourceId, iconIds: pickedHere, folderId: folderId || null, strategy });
      onCopied(summary);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the icons.");
    } finally {
      setBusy(false);
    }
  }

  if (projects.loading && !projects.data) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading projects…
      </p>
    );
  }
  if (sources.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">There is no other project to copy from yet.</p>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="copy-source" className="mb-1.5 block text-sm font-medium text-foreground">
            Copy From
          </label>
          <DropdownSelect
            id="copy-source"
            label="Copy From"
            value={sourceId}
            options={sourceOptions}
            showSelectedCheck={false}
            onChange={(value) => {
              setChosen(value);
              setPicked([]);
            }}
            portalMenu
            triggerClassName="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="min-w-0 flex-1 truncate text-left">{selectedSource.label}</span>
          </DropdownSelect>
        </div>
        <div>
          <label htmlFor="copy-search" className="mb-1.5 block text-sm font-medium text-foreground">
            Search Icons
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input id="copy-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" placeholder="Search icons by name" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#1555E0] focus:shadow-[0_0_0_3px_rgba(21,85,224,0.2)] focus:outline-none" />
          </div>
        </div>
      </div>

      <section aria-label="Icons">
        {icons.error ? (
          <p role="alert" className="text-sm text-destructive">
            {icons.error.message}
          </p>
        ) : icons.loading && !icons.data ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading icons…
          </p>
        ) : shown.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-dashed border-border p-10 text-center">
            <Layers aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-base font-semibold">
               No icons match {search}
            </p>
            <p className="mx-auto mt-1 text-sm text-muted-foreground">Try a different search.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 h-8">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all icons"
                    checked={allShownPicked}
                    onChange={(event) => setPicked(event.currentTarget.checked ? shown.map((icon) => icon.id) : [])}
                    className="h-4 w-4 accent-primary"
                  />
                  Select All {shown.length} shown
                </label>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{pickedHere.length} selected</span>
                {pickedHere.length > 0 && (
                  <Button size="sm" variant="ghost" className="px-2 text-primary" onClick={() => setPicked([])}>
                    Clear selection
                  </Button>
                )}
              </div>
            </div>
            <ul className="grid max-h-54 grid-cols-2 gap-2 p-1 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
              {shown.map((icon) => {
                const on = pickedHere.includes(icon.id);
                return (
                  <li key={icon.id}>
                    <label className={cn("relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-3 pt-7 text-center text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent")}>
                      <input type="checkbox" checked={on} onChange={() => toggle(icon.id)} className="absolute left-2 top-2 h-4 w-4 accent-[hsl(var(--primary))]" aria-label={icon.name} />
                      <SvgPreview svg={icon.svg ?? ""} size={36} />
                      <span className="w-full truncate text-muted-foreground">{icon.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FolderDropdownSelect id="copy-destination-folder" label="Destination Folder" value={folderId} folders={targetFolders} onChange={setFolderId} />
          </div>
          <div>
            <label htmlFor="copy-duplicate-strategy" className="mb-1.5 block text-sm font-medium text-foreground">If an Icon with That Name Exists</label>
            <DropdownSelect
              id="copy-duplicate-strategy"
              label="If an Icon with That Name Exists"
              value={strategy}
              options={duplicateOptions}
              showSelectedCheck={false}
              onChange={(value) => setStrategy(value as DuplicateStrategy)}
              portalMenu
              triggerClassName="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="min-w-0 flex-1 truncate">{duplicateOptions.find((option) => option.value === strategy)?.label}</span>
            </DropdownSelect>
          </div>
        </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <span role="status" className="mr-auto text-sm text-muted-foreground">{pluralize(pickedHere.length, "icon")} selected</span>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={pickedHere.length === 0}>
          {pickedHere.length > 0 ? `Copy ${pluralize(pickedHere.length, "Icon")}` : "Copy Icons"}
        </Button>
      </DialogFooter>
    </form>
  );
}
