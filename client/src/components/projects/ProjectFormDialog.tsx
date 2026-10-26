// Create or edit a project. Name, description, prefix and accent colour can be changed later; the purpose (sprite or font) is chosen once. A server error is shown inside the dialog and nothing closes.
import { Globe, Lock } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { createProject, updateProject } from "../../api/projects";
import type { ProjectDetail, ProjectPurpose, ProjectSummary, ProjectVisibility } from "../../api/types";
import { PROJECT_COLORS, suggestPrefix, validateProjectForm, type ProjectFormErrors } from "../../lib/projectForm";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { TextAreaField, TextField } from "../ui/Fields";
import { ColorSwatches, RadioCardGroup } from "../ui/RadioCardGroup";

type ProjectFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  // The project being edited (edit mode only).
  project?: ProjectSummary | undefined;
  onClose: () => void;
  onSaved: (project: ProjectDetail) => void;
};

export default function ProjectFormDialog({ open, mode, project, onClose, onSaved }: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={mode === "create" ? "New project" : "Edit project"} description={mode === "create" ? "A project holds your icons, folders and builds." : undefined}>
      <ProjectForm mode={mode} project={project} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function ProjectForm({ mode, project, onClose, onSaved }: Omit<ProjectFormDialogProps, "open">) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [prefix, setPrefix] = useState(project?.prefix ?? "icon");
  const [prefixEdited, setPrefixEdited] = useState(mode === "edit");
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]?.value ?? "#2563eb");
  const [purpose, setPurpose] = useState<ProjectPurpose>(project?.purpose ?? "sprite");
  const [visibility, setVisibility] = useState<ProjectVisibility>(project?.visibility ?? "private");
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groupId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateProjectForm({ name, prefix });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setServerError(null);
    try {
      const common = { name: name.trim(), description: description.trim(), prefix: prefix.trim().toLowerCase(), color, visibility };
      const saved = mode === "create" || !project ? await createProject({ ...common, purpose }) : await updateProject(project.id, common);
      onSaved(saved);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="Name"
        value={name}
        autoFocus
        maxLength={100}
        autoComplete="off"
        error={errors.name}
        onChange={(event) => {
          setName(event.target.value);
          if (!prefixEdited) setPrefix(suggestPrefix(event.target.value));
        }}
      />
      <TextAreaField label="Description" value={description} maxLength={500} placeholder="Optional" onChange={(event) => setDescription(event.target.value)} />
      <TextField
        label="Prefix"
        value={prefix}
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        hint="Used in icon ids and CSS classes, for example feather-arrow-left."
        error={errors.prefix}
        onChange={(event) => {
          setPrefix(event.target.value);
          setPrefixEdited(true);
        }}
      />
      <ColorSwatches legend="Accent color" name={`${groupId}-color`} value={color} onChange={setColor} colors={PROJECT_COLORS} />
      <RadioCardGroup
        legend="Type"
        name={`${groupId}-purpose`}
        value={purpose}
        onChange={setPurpose}
        disabled={mode === "edit"}
        hint={mode === "edit" ? "The type is fixed once the project is created." : undefined}
        options={[
          { value: "sprite", label: "Sprite", description: "Build SVG sprite sheets." },
          { value: "font", label: "Icon font", description: "Build icon fonts." },
        ]}
      />
      <RadioCardGroup
        legend="Who can see it"
        name={`${groupId}-visibility`}
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: "private", label: "Private", description: "Only you.", icon: <Lock aria-hidden="true" className="h-4 w-4" /> },
          { value: "public", label: "Public", description: "Others can look at it and copy icons. Only you can change it.", icon: <Globe aria-hidden="true" className="h-4 w-4" /> },
        ]}
      />
      {serverError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {mode === "create" ? "Create project" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
