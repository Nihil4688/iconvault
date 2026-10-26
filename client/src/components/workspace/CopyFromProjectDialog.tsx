// Copy icons into this project from another project the user can see (their own or public ones): pick the project, tick the icons, choose a folder here and what to do when a name is taken.
import { useState, type FormEvent } from "react";
import { copyIcons, listIcons } from "../../api/icons";
import { listProjects } from "../../api/projects";
import type { DuplicateStrategy, FolderWithCount, UploadSummary } from "../../api/types";
import { useDebounced } from "../../hooks/useDebounced";
import { useResource } from "../../hooks/useResource";
import { cn } from "../../lib/cn";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";
import SvgPreview from "../ui/SvgPreview";

type CopyFromProjectDialogProps = {
  open: boolean;
  targetProjectId: string;
  targetFolders: FolderWithCount[];
  defaultFolderId: string | null;
  onClose: () => void;
  onCopied: (summary: UploadSummary) => void;
};

export default function CopyFromProjectDialog({ open, onClose, ...rest }: CopyFromProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Copy from another project" description="Pick icons from one of your projects or a public project." size="lg">
      <CopyForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

function CopyForm({ targetProjectId, targetFolders, defaultFolderId, onClose, onCopied }: Omit<CopyFromProjectDialogProps, "open">) {
  const projects = useResource("copy-sources", () => listProjects({ scope: "all", status: "active", limit: 100 }));
  const sources = (projects.data?.projects ?? []).filter((p) => p.id !== targetProjectId);

  const [chosen, setChosen] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sourceId = chosen || sources[0]?.id || "";
  const query = useDebounced(search.trim(), 300);
  const icons = useResource(sourceId ? `copy-icons:${sourceId}:${query}` : null, () => listIcons(sourceId, { sort: "name", limit: 200, ...(query ? { search: query } : {}) }));
  const shown = icons.data?.icons ?? [];
  const folderOptions = flattenFolderTree(buildFolderTree(targetFolders));

  // Ticks that belong to a project that is no longer chosen are ignored.
  const pickedHere = picked.filter((id) => shown.some((icon) => icon.id === id));

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
        <SelectField
          label="Copy from"
          value={sourceId}
          onChange={(event) => {
            setChosen(event.target.value);
            setPicked([]);
          }}
        >
          {sources.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.access.canEdit ? "yours" : `by ${project.owner.displayName}`})
            </option>
          ))}
        </SelectField>
        <div>
          <label htmlFor="copy-search" className="mb-1 block text-sm font-medium">
            Search icons
          </label>
          <input id="copy-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
          <span>Icons</span>
          <span className="text-xs font-normal text-muted-foreground">{pluralize(pickedHere.length, "icon")} selected</span>
        </legend>
        {icons.error ? (
          <p role="alert" className="text-sm text-destructive">
            {icons.error.message}
          </p>
        ) : icons.loading && !icons.data ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading icons…
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No icons found in that project.</p>
        ) : (
          <>
            <div className="mb-2 flex gap-2">
              <Button size="sm" onClick={() => setPicked(shown.map((icon) => icon.id))}>
                Select all {shown.length}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked([])} disabled={pickedHere.length === 0}>
                Clear
              </Button>
            </div>
            <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {shown.map((icon) => {
                const on = pickedHere.includes(icon.id);
                return (
                  <li key={icon.id}>
                    <label className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent")}>
                      <input type="checkbox" checked={on} onChange={() => toggle(icon.id)} className="sr-only" aria-label={icon.name} />
                      <SvgPreview svg={icon.svg ?? ""} size={32} />
                      <span className="w-full truncate">{icon.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Put them in" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
          <option value="">Uncategorized (project root)</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {`${"  ".repeat(folder.depth)}${folder.name}`}
            </option>
          ))}
        </SelectField>
        <SelectField label="If an icon with that name exists" value={strategy} onChange={(event) => setStrategy(event.target.value as DuplicateStrategy)}>
          <option value="rename">Keep both (add a number)</option>
          <option value="replace">Replace it</option>
          <option value="skip">Skip</option>
        </SelectField>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={pickedHere.length === 0}>
          {pickedHere.length > 0 ? `Copy ${pluralize(pickedHere.length, "icon")}` : "Copy icons"}
        </Button>
      </DialogFooter>
    </form>
  );
}

