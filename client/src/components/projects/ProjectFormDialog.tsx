// Create or edit a project. Name, description, prefix and accent colour can be changed later; the purpose (sprite or font) is chosen once. A server error is shown inside the dialog and nothing closes.
import { Globe, Lock } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { createProject, listProjects, updateProject } from "../../api/projects";
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
    <Dialog open={open} onClose={onClose} dismissOnBackdrop={false} title={mode === "create" ? "New Project" : "Edit Project"} description={mode === "create" ? "A project holds your icons, folders and builds." : undefined}>
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
  const [existingNames, setExistingNames] = useState<string[] | null>(mode === "create" ? null : []);
  const [namesLoadFailed, setNamesLoadFailed] = useState(false);
  const groupId = useId();

  useEffect(() => {
    if (mode !== "create") return;
    let active = true;
    (async () => {
      const names: string[] = [];
      let page = 1;
      let total = 0;
      do {
        const result = await listProjects({ scope: "mine", status: "all", page, limit: 100 });
        names.push(...result.projects.map((item) => item.name));
        total = result.total;
        page += 1;
      } while (names.length < total);
      return names;
    })()
      .then((names) => {
        if (active) setExistingNames(names);
      })
      .catch(() => {
        if (active) setNamesLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  const normalizedName = name.trim().toLocaleLowerCase();
  const duplicateProjectName = mode === "create" && normalizedName
    ? existingNames?.find((existing) => existing.trim().toLocaleLowerCase() === normalizedName)
    : undefined;
  const duplicateName = duplicateProjectName ? `Project name "${duplicateProjectName}" already exists.` : undefined;
  const namesUnavailable = mode === "create" && (existingNames === null || namesLoadFailed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateProjectForm({ name, prefix });
    setErrors(found);
    if (Object.keys(found).length > 0 || duplicateName || namesUnavailable) return;

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
        placeholder="Enter project name"
        required
        value={name}
        autoFocus
        maxLength={100}
        autoComplete="off"
        error={errors.name ?? duplicateName ?? (namesUnavailable && name.trim() ? "Could not check existing project names. Try again." : undefined)}
        onChange={(event) => {
          setName(event.target.value);
          if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
          if (!prefixEdited) setPrefix(suggestPrefix(event.target.value));
        }}
      />
      <TextAreaField label="Description" value={description} maxLength={500} placeholder="Add a short description (optional)" onChange={(event) => setDescription(event.target.value)} />
      <TextField
        label="Prefix"
        required
        placeholder="e.g. feather"
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
      <ColorSwatches legend="Accent Color" name={`${groupId}-color`} value={color} onChange={setColor} colors={PROJECT_COLORS} />
      <RadioCardGroup
        legend="Type"
        name={`${groupId}-purpose`}
        value={purpose}
        onChange={setPurpose}
        disabled={mode === "edit"}
        hint={mode === "edit" ? "The type is fixed once the project is created." : undefined}
        options={[
          { value: "sprite", label: "Sprite", description: "Build SVG sprite sheets." },
          { value: "font", label: "Icon Font", description: "Build icon fonts." },
        ]}
      />
      <RadioCardGroup
        legend="Who Can See It"
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
        <Button type="submit" variant="primary" loading={busy || (mode === "create" && existingNames === null && !namesLoadFailed)} disabled={mode === "create" && (existingNames === null || namesLoadFailed || Boolean(duplicateName))}>
          {mode === "create" ? "Create Project" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
