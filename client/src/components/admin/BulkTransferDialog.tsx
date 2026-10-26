// Move several projects to one user (admins only). The result says how many moved and which ones could not.
import { useState, type FormEvent } from "react";
import { bulkTransferProjects, listUsers } from "../../api/admin";
import type { BulkProjectsResult, ProjectSummary } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";

type BulkTransferDialogProps = {
  open: boolean;
  projects: ProjectSummary[];
  onClose: () => void;
  onDone: (result: BulkProjectsResult, ownerName: string) => void;
};

export default function BulkTransferDialog({ open, onClose, ...rest }: BulkTransferDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Transfer projects" description="Move the chosen projects to another user." size="md">
      <Form onClose={onClose} {...rest} />
    </Dialog>
  );
}

function Form({ projects, onClose, onDone }: Omit<BulkTransferDialogProps, "open">) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const users = useResource("transfer-candidates-bulk", () => listUsers({ limit: 100 }));
  const candidates = users.data?.users ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) {
      setError("Choose the new owner.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await bulkTransferProjects(projects.map((project) => project.id), target);
      onDone(result, candidates.find((user) => user.id === target)?.displayName ?? "the new owner");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transfer the projects.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{pluralize(projects.length, "project")}</span> will move: {projects.slice(0, 4).map((project) => project.name).join(", ")}
        {projects.length > 4 ? ` and ${projects.length - 4} more` : ""}.
      </p>
      <SelectField label="New owner" value={target} onChange={(event) => setTarget(event.target.value)} hint={users.loading && !users.data ? "Loading users…" : undefined}>
        <option value="">Choose a user</option>
        {candidates.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName} ({user.email})
          </option>
        ))}
      </SelectField>
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
