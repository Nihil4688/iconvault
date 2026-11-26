// Puts a project in a dashboard group by hand, or takes it out. The group name can be typed or picked from the groups already in use; projects with the same group show together as one group card. A server error is shown inside the dialog and nothing closes.
import { useId, useState, type FormEvent } from "react";
import { updateProject } from "../../api/projects";
import type { ProjectDetail, ProjectSummary } from "../../api/types";
import { groupKey } from "../../lib/projectGroups";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { TextField } from "../ui/Fields";

type MoveToGroupDialogProps = {
  project: ProjectSummary | null;
  // Group names already in use, offered as suggestions.
  groups: string[];
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
};

export default function MoveToGroupDialog({ project, groups, onClose, onSaved }: MoveToGroupDialogProps) {
  return (
    <Dialog open={project !== null} onClose={onClose} title={project?.group ? "Change Group" : "Move to Group"} description="Projects in the same group show together on the dashboard.">
      {project && <GroupForm project={project} groups={groups} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function GroupForm({ project, groups, onClose, onSaved }: { project: ProjectSummary; groups: string[]; onClose: () => void; onSaved: (project: ProjectDetail) => void }) {
  const [name, setName] = useState(project.group);
  const [error, setError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const listId = useId();
  const others = groups.filter((group) => groupKey(group) !== groupKey(project.group));

  async function save(group: string, action: "save" | "remove") {
    setBusy(action);
    setServerError(null);
    try {
      onSaved(await updateProject(project.id, { group }));
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not update the group.");
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const group = name.trim().replace(/\s+/g, " ");
    if (!group) return setError("Enter a group name.");
    if (group.length > 60) return setError("Use 60 characters or fewer.");
    // A group spelled like one in use joins it with that spelling.
    const existing = groups.find((item) => groupKey(item) === groupKey(group));
    void save(existing ?? group, "save");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Project: <span className="font-semibold text-foreground">{project.name}</span>
      </p>
      <TextField
        label="Group Name"
        required
        autoFocus
        value={name}
        maxLength={60}
        autoComplete="off"
        placeholder="e.g. BoldDesk"
        list={others.length > 0 ? listId : undefined}
        hint={others.length > 0 ? "Type a new name or pick an existing group." : "Type a name for the new group."}
        error={error}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
        }}
      />
      {others.length > 0 && (
        <>
          <datalist id={listId}>
            {others.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
          <div role="group" aria-label="Existing Groups" className="flex flex-wrap gap-1.5">
            {others.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={groupKey(group) === groupKey(name)}
                onClick={() => {
                  setName(group);
                  setError(undefined);
                }}
                className="max-w-full truncate rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                {group}
              </button>
            ))}
          </div>
        </>
      )}
      {serverError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        {project.group && (
          <Button variant="secondary" className="mr-auto text-destructive" onClick={() => void save("", "remove")} loading={busy === "remove"} disabled={busy !== null}>
            Remove from Group
          </Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy !== null}>
          {project.group ? "Save" : "Move"}
        </Button>
      </DialogFooter>
    </form>
  );
}
