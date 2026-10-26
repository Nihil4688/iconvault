// The Project Settings section, laid out like Icon Vault's: a card with the project's settings (type shown but fixed, name, description, prefix, accent colour, who can see it) and its primary action, Save settings, at the top; a card to export the whole project; a card of usage snippets to copy; and a danger zone (archive, transfer for admins, delete). Only the owner (or an admin) can change settings; everyone else sees them read-only.
import { Archive, ArchiveRestore, BookOpen, Copy, Download, FileArchive, Globe, Lock, Save, Trash2, Type, UserCog, Shapes } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { deleteProject, exportProject, updateProject } from "../../api/projects";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/workspaceContext";
import { copyText } from "../../lib/clipboard";
import { formatDate, pluralize } from "../../lib/format";
import { PROJECT_COLORS, validateProjectForm, type ProjectFormErrors } from "../../lib/projectForm";
import { triggerBrowserDownload } from "../../utils/zipBundle";
import TransferProjectDialog from "../admin/TransferProjectDialog";
import { Button } from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { TextAreaField, TextField } from "../ui/Fields";
import { ColorSwatches, RadioCardGroup } from "../ui/RadioCardGroup";

const card = "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6";

export default function SettingsTab() {
  const { project, refreshProject } = useWorkspace();
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const groupId = useId();
  const canManage = project.access.canManage;
  const canEdit = project.access.canEdit;
  const isAdmin = currentUser?.role === "admin";

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [prefix, setPrefix] = useState(project.prefix);
  const [color, setColor] = useState(project.color);
  const [visibility, setVisibility] = useState(project.visibility);
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dirty = name !== project.name || description !== project.description || prefix !== project.prefix || color.toLowerCase() !== project.color.toLowerCase() || visibility !== project.visibility;
  const isFont = project.purpose === "font";

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = validateProjectForm({ name, prefix });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateProject(project.id, { name: name.trim(), description: description.trim(), prefix: prefix.trim().toLowerCase(), color, visibility });
      refreshProject();
      showToast(`Saved “${saved.name}”.`, "success");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await updateProject(project.id, { isArchived: !project.isArchived });
      refreshProject();
      showToast(project.isArchived ? `Marked “${project.name}” as active.` : `Marked “${project.name}” as draft.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not change the project.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await exportProject(project.id);
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not export the project.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    showToast(ok ? `Copied ${what}.` : "Could not copy to the clipboard.", ok ? "success" : "error");
  }

  const fontName = project.name.replace(/[^a-zA-Z0-9_-]/g, "") || "IconFont";
  const snippets = [
    {
      title: isFont ? "Icon font CSS usage" : "SVG sprite inline usage",
      code: isFont ? `<!-- Load the stylesheet -->\n<link rel="stylesheet" href="${fontName}.css">\n\n<!-- Show an icon -->\n<i class="${project.prefix}-home"></i>` : `<svg class="icon" aria-hidden="true">\n  <use href="sprite.svg#${project.prefix}-home"></use>\n</svg>`,
    },
    {
      title: isFont ? "Icon font in React" : "Build the sprite with the command line",
      code: isFont ? `<i className="${project.prefix}-home" aria-hidden="true" />` : `iconvault sprite "${project.name}" --out sprite.svg`,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section aria-labelledby="settings-details" className={card}>
        <form onSubmit={save} noValidate>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="settings-details" className="text-lg font-bold">
                Project settings
              </h2>
              <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Owner:</span> {project.owner.displayName}
                {project.owner.email ? ` (${project.owner.email})` : ""}
              </span>
            </div>
            {canManage && (
              <Button type="submit" variant="primary" icon={<Save aria-hidden="true" className="h-4 w-4" />} loading={saving} disabled={!dirty}>
                Save settings
              </Button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Name, CSS identifiers, accent colour and who can see the project. Created {formatDate(project.createdAt)}.</p>
          {saveError && (
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              {saveError}
            </p>
          )}
          {!canManage && <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Only the owner can change these settings.</p>}

          <div className="mt-5 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Project type</p>
                <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Lock aria-hidden="true" className="h-3 w-3" /> Permanent (cannot be changed)
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isFont ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                  {isFont ? <Type aria-hidden="true" className="h-4 w-4" /> : <Shapes aria-hidden="true" className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-semibold">{isFont ? "Icon font project" : "SVG sprite project"}</p>
                  <p className="text-xs text-muted-foreground">{isFont ? "Outputs web fonts (WOFF2, WOFF, TTF, EOT, SVG) with a stable character for every icon and CSS classes." : "Outputs one optimized SVG sprite sheet of <symbol> elements for <use> tags."}</p>
                </div>
              </div>
            </div>

            <TextField label="Project name" value={name} maxLength={100} autoComplete="off" disabled={!canManage} error={errors.name} onChange={(event) => setName(event.target.value)} />
            <TextAreaField label="Description" value={description} maxLength={500} disabled={!canManage} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="CSS / symbol prefix" value={prefix} maxLength={20} autoComplete="off" spellCheck={false} disabled={!canManage} hint="Used in icon ids and CSS classes, for example feather-arrow-left." error={errors.prefix} onChange={(event) => setPrefix(event.target.value)} />
              <fieldset disabled={!canManage} className="disabled:opacity-60">
                <ColorSwatches legend="Accent colour" name={`${groupId}-color`} value={color} onChange={setColor} colors={PROJECT_COLORS} />
              </fieldset>
            </div>
            <RadioCardGroup
              legend="Who can see it"
              name={`${groupId}-visibility`}
              value={visibility}
              onChange={setVisibility}
              disabled={!canManage}
              options={[
                { value: "private", label: "Private project", description: "Only you and workspace administrators can see it.", icon: <Lock aria-hidden="true" className="h-4 w-4" /> },
                { value: "public", label: "Public project", description: "Anyone signed in can view it and copy icons. Only you (or an admin) can change it.", icon: <Globe aria-hidden="true" className="h-4 w-4" /> },
              ]}
            />
          </div>
        </form>
      </section>

      <section aria-labelledby="settings-export" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="settings-export" className="flex items-center gap-2 text-base font-bold">
              <FileArchive aria-hidden="true" className="h-4 w-4 text-primary" />
              Export entire project
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Download a ZIP with the settings, folders and icons (not the trash or saved versions). Use Import project on the dashboard to create a copy from it.</p>
          </div>
          <Button icon={<Download aria-hidden="true" className="h-4 w-4" />} onClick={handleExport} loading={exporting}>
            Export project
          </Button>
        </div>
      </section>

      <section aria-labelledby="settings-guide" className={`${card} space-y-4`}>
        <div>
          <h2 id="settings-guide" className="flex items-center gap-2 text-base font-bold">
            <BookOpen aria-hidden="true" className="h-4 w-4 text-primary" />
            Integration guide &amp; snippets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Ready-to-use snippets for using this project's {isFont ? "icon font" : "sprite"} in a page. Replace <code className="font-mono">home</code> with the slug of any icon.</p>
        </div>
        {snippets.map((snippet, index) => (
          <div key={snippet.title}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <h3 className="font-semibold">{`${index + 1}. ${snippet.title}`}</h3>
              <Button size="sm" variant="ghost" icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => void copy(snippet.code, snippet.title.toLowerCase())} aria-label={`Copy: ${snippet.title}`}>
                Copy
              </Button>
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs">{snippet.code}</pre>
          </div>
        ))}
      </section>

      {canEdit && (
        <section aria-labelledby="settings-danger" className="rounded-2xl border border-destructive/40 p-5 sm:p-6">
          <h2 id="settings-danger" className="text-lg font-semibold text-destructive">
            Danger zone
          </h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted-foreground">{project.isArchived ? "Mark it as active to show this project in your active list again." : "A draft is hidden from your active list and from others. Nothing is deleted."}</p>
            <Button onClick={toggleArchive} loading={busy} icon={project.isArchived ? <ArchiveRestore aria-hidden="true" className="h-4 w-4" /> : <Archive aria-hidden="true" className="h-4 w-4" />}>
              {project.isArchived ? "Mark as active" : "Mark as draft"}
            </Button>
          </div>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="max-w-md text-sm text-muted-foreground">As an administrator you can move this project to another user.</p>
              <Button icon={<UserCog aria-hidden="true" className="h-4 w-4" />} onClick={() => setTransferring(true)}>
                Transfer ownership
              </Button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="max-w-md text-sm text-muted-foreground">Deleting removes the project with all its icons, folders and history for good.</p>
            <Button variant="destructive" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => setDeleting(true)}>
              Delete project
            </Button>
          </div>
        </section>
      )}

      <TransferProjectDialog
        open={transferring}
        project={project}
        onClose={() => setTransferring(false)}
        onTransferred={(updated) => {
          refreshProject();
          showToast(`Moved “${updated.name}” to ${updated.owner.displayName}.`, "success");
        }}
      />
      <ConfirmDialog
        open={deleting}
        title={`Delete “${project.name}”?`}
        message={`This permanently deletes the project with its ${pluralize(project.iconCount, "icon")}, folders and history. This cannot be undone.`}
        confirmLabel="Delete project"
        destructive
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await deleteProject(project.id);
          showToast(`Deleted “${project.name}”.`, "success");
          navigate("/");
        }}
      />
    </div>
  );
}
