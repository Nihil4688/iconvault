// Copies one icon (found through search) into a project the user can edit: choose the project, an optional folder and what to do if the id is taken.
import { useState, type FormEvent } from "react";
import { listFolders } from "../../api/folders";
import { copyIcons } from "../../api/icons";
import { listProjects } from "../../api/projects";
import type { DuplicateStrategy, IconSearchResult, UploadSummary } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import DropdownSelect from "../ui/DropdownSelect";
import SvgPreview from "../ui/SvgPreview";
import FolderDropdownSelect from "../workspace/FolderDropdownSelect";

const duplicateOptions = [
  { value: "rename", label: "Keep Both (Add a Number)" },
  { value: "replace", label: "Replace It" },
  { value: "skip", label: "Skip" },
];

const triggerClassName = "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";

type CopyToProjectDialogProps = {
  open: boolean;
  icon: IconSearchResult | null;
  onClose: () => void;
  onCopied: (result: UploadSummary, destinationName: string) => void;
};

export default function CopyToProjectDialog({ open, icon, onClose, onCopied }: CopyToProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Copy to Project" description="Choose where to copy this icon.">
      {icon && <CopyForm icon={icon} onClose={onClose} onCopied={onCopied} />}
    </Dialog>
  );
}

function CopyForm({ icon, onClose, onCopied }: { icon: IconSearchResult; onClose: () => void; onCopied: CopyToProjectDialogProps["onCopied"] }) {
  const projects = useResource("copy-destinations", () => listProjects({ scope: "mine", status: "active", limit: 100 }));
  const editable = (projects.data?.projects ?? []).filter((p) => p.access.canEdit);

  const [chosen, setChosen] = useState("");
  const [folderId, setFolderId] = useState("");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Until the user picks one, the first project is selected.
  const projectId = chosen || editable[0]?.id || "";
  const folders = useResource(projectId ? `folders:${projectId}` : null, () => listFolders(projectId));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await copyIcons(projectId, { sourceProjectId: icon.projectId, iconIds: [icon.id], folderId: folderId || null, strategy });
      onCopied(result, editable.find((p) => p.id === projectId)?.name ?? "the project");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the icon.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section aria-labelledby="copy-icon-heading">
        <h3 id="copy-icon-heading" className="mb-1.5 text-sm font-medium text-foreground">
          Icon to Copy
        </h3>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <SvgPreview svg={icon.svg ?? ""} size={28} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{icon.name}</p>
            {icon.project && <p className="truncate text-sm text-muted-foreground">Source: {icon.project.name}</p>}
          </div>
        </div>
      </section>

      {projects.loading && !projects.data ? (
        // Placeholders with the shape of the Project, Folder and duplicate fields, so the dialog does not jump when they arrive.
        <div role="status" aria-busy="true" aria-label="Loading your projects" className="space-y-4">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <div className="skeleton-shimmer mb-1.5 h-5 w-24 rounded" />
              <div className="skeleton-shimmer h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : editable.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no project you can add icons to yet. Create one first.</p>
      ) : (
        <>
          <div>
            <label htmlFor="copy-to-project" className="mb-1.5 block text-sm font-medium text-foreground">
              Project
            </label>
            <DropdownSelect
              id="copy-to-project"
              label="Project"
              value={projectId}
              options={editable.map((project) => ({ value: project.id, label: project.name }))}
              showSelectedCheck={false}
              onChange={(value) => {
                setChosen(value);
                setFolderId("");
              }}
              portalMenu
              triggerClassName={triggerClassName}
            >
              <span className="min-w-0 flex-1 truncate">{editable.find((project) => project.id === projectId)?.name}</span>
            </DropdownSelect>
          </div>
          <FolderDropdownSelect id="copy-to-folder" label="Folder" rootLabel="Project Root" value={folderId} folders={folders.data?.folders ?? []} onChange={setFolderId} />
          <div>
            <label htmlFor="copy-to-strategy" className="mb-1.5 block text-sm font-medium text-foreground">
              If an Icon with That Name Exists
            </label>
            <DropdownSelect
              id="copy-to-strategy"
              label="If an Icon with That Name Exists"
              value={strategy}
              options={duplicateOptions}
              showSelectedCheck={false}
              onChange={(value) => setStrategy(value as DuplicateStrategy)}
              portalMenu
              triggerClassName={triggerClassName}
            >
              <span className="min-w-0 flex-1 truncate">{duplicateOptions.find((option) => option.value === strategy)?.label}</span>
            </DropdownSelect>
          </div>
        </>
      )}

      {(error || projects.error) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error ?? projects.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!projectId}>
          Copy Icon
        </Button>
      </DialogFooter>
    </form>
  );
}
