// Dialogs for folder actions: name a new or renamed folder, and choose a new parent when moving one.
import { useState, type FormEvent } from "react";
import type { FolderWithCount } from "../../api/types";
import { buildFolderTree, descendantIds, flattenFolderTree } from "../../lib/folderTree";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField, TextField } from "../ui/Fields";

type FolderNameDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export function FolderNameDialog({ open, title, submitLabel, initialName = "", onClose, onSubmit }: FolderNameDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <NameForm submitLabel={submitLabel} initialName={initialName} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function NameForm({ submitLabel, initialName, onClose, onSubmit }: Pick<FolderNameDialogProps, "submitLabel" | "onClose" | "onSubmit"> & { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <TextField label="Folder name" value={name} autoFocus maxLength={100} autoComplete="off" error={error ?? undefined} onChange={(event) => setName(event.target.value)} />
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

type MoveFolderDialogProps = {
  open: boolean;
  folder: FolderWithCount | null;
  folders: FolderWithCount[];
  onClose: () => void;
  onSubmit: (parentId: string | null) => Promise<void>;
};

export function MoveFolderDialog({ open, folder, folders, onClose, onSubmit }: MoveFolderDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={folder ? `Move “${folder.name}”` : "Move folder"} size="sm">
      {folder && <MoveForm folder={folder} folders={folders} onClose={onClose} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function MoveForm({ folder, folders, onClose, onSubmit }: { folder: FolderWithCount; folders: FolderWithCount[]; onClose: () => void; onSubmit: MoveFolderDialogProps["onSubmit"] }) {
  const [parent, setParent] = useState(folder.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A folder cannot go into itself or anything inside it.
  const blocked = descendantIds(folders, folder.id);
  blocked.add(folder.id);
  const options = flattenFolderTree(buildFolderTree(folders)).filter((candidate) => !blocked.has(candidate.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parent || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <SelectField label="Move into" value={parent} onChange={(event) => setParent(event.target.value)} error={error ?? undefined}>
        <option value="">Project root</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {`${"  ".repeat(option.depth)}${option.name}`}
          </option>
        ))}
      </SelectField>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Move folder
        </Button>
      </DialogFooter>
    </form>
  );
}
