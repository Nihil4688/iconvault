// Delete a user as an admin. If they own projects the admin chooses: delete those projects with everything in them, or move them to another user first. A failure is shown inside the dialog and nothing closes.
import { useState, type FormEvent } from "react";
import { deleteUser, listUsers } from "../../api/admin";
import type { AdminUser, DeleteUserResult } from "../../api/types";
import { useResource } from "../../hooks/useResource";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";

type DeleteUserDialogProps = {
  user: AdminUser | null;
  onClose: () => void;
  onDeleted: (user: AdminUser, result: DeleteUserResult) => void;
};

export default function DeleteUserDialog({ user, onClose, onDeleted }: DeleteUserDialogProps) {
  return (
    <Dialog open={user !== null} onClose={onClose} title={user ? `Delete ${user.displayName}?` : "Delete user"} size="md">
      {user && <DeleteForm key={user.id} user={user} onClose={onClose} onDeleted={onDeleted} />}
    </Dialog>
  );
}

type Choice = "delete" | "transfer";

function DeleteForm({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: DeleteUserDialogProps["onDeleted"] }) {
  const hasProjects = user.projectCount > 0;
  const [choice, setChoice] = useState<Choice>("transfer");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = useResource(hasProjects ? "delete-user-candidates" : null, () => listUsers({ limit: 100 }));
  const candidates = (others.data?.users ?? []).filter((candidate) => candidate.id !== user.id);
  const transferring = hasProjects && choice === "transfer";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (transferring && !target) {
      setError("Choose who receives the projects.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await deleteUser(user.id, transferring ? { transferTo: target } : {});
      onDeleted(user, result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">
        This removes <span className="font-medium">{user.email}</span> and ends their sessions and API tokens. They can sign in again later with a fresh, empty account.
      </p>

      {hasProjects ? (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-sm font-medium">They own {pluralize(user.projectCount, "project")} with {pluralize(user.iconCount, "icon")}. What happens to them?</legend>
          <label className="flex cursor-pointer gap-2 text-sm">
            <input type="radio" name="projects" checked={choice === "transfer"} onChange={() => setChoice("transfer")} className="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>Move them to another user</span>
          </label>
          {choice === "transfer" && (
            <SelectField label="New owner" value={target} onChange={(event) => setTarget(event.target.value)} hint={others.loading && !others.data ? "Loading users…" : undefined}>
              <option value="">Choose a user</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.displayName} ({candidate.email})
                </option>
              ))}
            </SelectField>
          )}
          <label className="flex cursor-pointer gap-2 text-sm">
            <input type="radio" name="projects" checked={choice === "delete"} onChange={() => setChoice("delete")} className="mt-0.5 accent-[hsl(var(--primary))]" />
            <span>Delete them with everything in them (cannot be undone)</span>
          </label>
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">They own no projects.</p>
      )}

      {others.error && !others.data && hasProjects && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load the users: {others.error.message}
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
        <Button type="submit" variant="destructive" loading={busy}>
          {transferring ? "Move projects and delete user" : "Delete user"}
        </Button>
      </DialogFooter>
    </form>
  );
}
