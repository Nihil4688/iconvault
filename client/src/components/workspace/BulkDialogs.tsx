// Dialogs for bulk actions that need a choice: where to move the selected icons, and which tags to add, remove or set.
import { useState, type FormEvent } from "react";
import type { FolderWithCount } from "../../api/types";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { pluralize } from "../../lib/format";
import { parseTags } from "../../lib/upload";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField, TextField } from "../ui/Fields";

type MoveIconsDialogProps = {
  open: boolean;
  count: number;
  folders: FolderWithCount[];
  onClose: () => void;
  onSubmit: (folderId: string | null) => Promise<void>;
};

export function MoveIconsDialog({ open, count, folders, onClose, onSubmit }: MoveIconsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Move ${pluralize(count, "icon")}`} size="sm">
      <MoveForm folders={folders} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function MoveForm({ folders, onClose, onSubmit }: Pick<MoveIconsDialogProps, "folders" | "onClose" | "onSubmit">) {
  const [folderId, setFolderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = flattenFolderTree(buildFolderTree(folders));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(folderId || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the icons.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <SelectField label="Move into" value={folderId} onChange={(event) => setFolderId(event.target.value)} error={error ?? undefined}>
        <option value="">Uncategorized (project root)</option>
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
          Move
        </Button>
      </DialogFooter>
    </form>
  );
}

type TagMode = "add" | "remove" | "set";

type TagIconsDialogProps = {
  open: boolean;
  count: number;
  onClose: () => void;
  onSubmit: (tags: string[], mode: TagMode) => Promise<void>;
};

export function TagIconsDialog({ open, count, onClose, onSubmit }: TagIconsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Tag ${pluralize(count, "icon")}`} size="sm">
      <TagForm onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function TagForm({ onClose, onSubmit }: Pick<TagIconsDialogProps, "onClose" | "onSubmit">) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<TagMode>("add");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const tags = parseTags(text);
    if (tags.length === 0) {
      setError("Enter at least one tag.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(tags, mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the tags.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <SelectField label="Action" value={mode} onChange={(event) => setMode(event.target.value as TagMode)}>
        <option value="add">Add these tags</option>
        <option value="remove">Remove these tags</option>
        <option value="set">Replace all tags with these</option>
      </SelectField>
      <TextField label="Tags" value={text} autoFocus autoComplete="off" hint="Separate tags with commas." error={error ?? undefined} onChange={(event) => setText(event.target.value)} />
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Apply
        </Button>
      </DialogFooter>
    </form>
  );
}
