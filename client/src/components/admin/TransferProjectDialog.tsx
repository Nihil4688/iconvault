// Move a project to another owner (admins only). The new owner gets full control; the previous owner keeps only what the project's visibility gives anyone.
import { useState, type FormEvent } from "react";
import { listUsers, transferProject } from "../../api/admin";
import type { ProjectDetail } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";

type TransferProjectDialogProps = {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onTransferred: (project: ProjectDetail) => void;
};

export default function TransferProjectDialog({ open, onClose, ...rest }: TransferProjectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Transfer ownership" description="Move this project to another user." size="md">
      <TransferForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

function TransferForm({ project, onClose, onTransferred }: Omit<TransferProjectDialogProps, "open">) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const users = useResource("transfer-candidates", () => listUsers({ limit: 100 }));
  const candidates = (users.data?.users ?? []).filter((user) => user.id !== project.owner.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) {
      setError("Choose the new owner.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onTransferred(await transferProject(project.id, target));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{project.name}</span> is owned by {project.owner.displayName}.
      </p>
      <SelectField label="New owner" value={target} onChange={(event) => setTarget(event.target.value)} hint={users.loading && !users.data ? "Loading users…" : undefined}>
        <option value="">Choose a user</option>
        {candidates.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName} ({user.email})
          </option>
        ))}
      </SelectField>
      {users.error && !users.data && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load the users: {users.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Transfer
        </Button>
      </DialogFooter>
    </form>
  );
}
