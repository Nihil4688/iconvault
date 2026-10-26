// Copies one icon (found through search) into a project the user can edit: choose the project, an optional folder and what to do if the id is taken.
import { useState, type FormEvent } from "react";
import { listFolders } from "../../api/folders";
import { copyIcons } from "../../api/icons";
import { listProjects } from "../../api/projects";
import type { DuplicateStrategy, IconSearchResult, UploadSummary } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";
import SvgPreview from "../ui/SvgPreview";

type CopyToProjectDialogProps = {
  open: boolean;
  icon: IconSearchResult | null;
  onClose: () => void;
  onCopied: (result: UploadSummary, destinationName: string) => void;
};

export default function CopyToProjectDialog({ open, icon, onClose, onCopied }: CopyToProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Copy to project" description="Add a copy of this icon to one of your projects.">
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
  const folderOptions = flattenFolderTree(buildFolderTree(folders.data?.folders ?? []));

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
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
        <SvgPreview svg={icon.svg ?? ""} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{icon.name}</p>
          {icon.project && <p className="truncate text-xs text-muted-foreground">from {icon.project.name}</p>}
        </div>
      </div>

      {projects.loading && !projects.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your projects…
        </p>
      ) : editable.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no project you can add icons to yet. Create one first.</p>
      ) : (
        <>
          <SelectField
            label="Project"
            value={projectId}
            onChange={(event) => {
              setChosen(event.target.value);
              setFolderId("");
            }}
          >
            {editable.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Folder" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Project root</option>
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
          Copy icon
        </Button>
      </DialogFooter>
    </form>
  );
}
