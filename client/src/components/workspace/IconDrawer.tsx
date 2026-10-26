// The panel that opens when an icon is clicked. Preview at the project-wide icon size, colour and style (set in the Icons toolbar) on the background chosen there; quick actions (copy as SVG, React or Vue, download, optimize, move to trash); and three tabs: Details (name, folder, tags, codepoint), Code (edit the SVG with a live preview, and the generated snippets) and Versions (restore an earlier state). People who cannot edit the project see everything read-only.
import { Copy, Download, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { deleteIcon, downloadIcon, getIcon, optimizeIcon, restoreIcon, restoreVersion, updateIcon } from "../../api/icons";
import type { FolderWithCount, IconDetail } from "../../api/types";
import { useToast } from "../../context/ToastContext";
import { useIconAppearance } from "../../hooks/useIconAppearance";
import { useResource } from "../../hooks/useResource";
import { usePersistentChoice } from "../../hooks/usePersistentChoice";
import { cn } from "../../lib/cn";
import { copyText } from "../../lib/clipboard";
import { codepointProblem } from "../../lib/codepoint";
import { buildFolderTree, flattenFolderTree, folderPath } from "../../lib/folderTree";
import { formatBytes, formatDate, formatRelative, savingsPercent } from "../../lib/format";
import { iconWarnings } from "../../lib/iconInfo";
import { SURFACES, surfaceClass, surfaceStyle } from "../../lib/previewSurface";
import { toReactComponent, toVueComponent } from "../../lib/svgSnippets";
import { parseTags } from "../../lib/upload";
import { triggerBrowserDownload } from "../../utils/zipBundle";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import { SelectField, TextAreaField, TextField } from "../ui/Fields";
import SvgPreview from "../ui/SvgPreview";
import Tabs from "../ui/Tabs";


type IconDrawerProps = {
  projectId?: string;
  // The icon to show, or null when the drawer is closed.
  iconId: string | null;
  canEdit: boolean;
  folders: FolderWithCount[];
  // Used to show the icon's id as it will appear in a sprite or font, for example "feather-arrow-left".
  idPrefix: string;
  onClose: () => void;
  // Something changed (edit, optimize, restore, trash): refresh the lists behind the drawer.
  onChanged: () => void;
};

export default function IconDrawer({ iconId, onClose, ...rest }: IconDrawerProps) {
  return (
    <Dialog open={iconId !== null} onClose={onClose} title="Icon details" placement="drawer">
      {iconId && <DrawerBody key={iconId} iconId={iconId} onClose={onClose} {...rest} />}
    </Dialog>
  );
}

type Tab = "details" | "code" | "versions";

function DrawerBody({ iconId, onClose, ...rest }: Omit<IconDrawerProps, "iconId"> & { iconId: string }) {
  const icon = useResource(`icon:${iconId}`, () => getIcon(iconId));
  const [tab, setTab] = useState<Tab>("details");

  if (icon.error && !icon.data) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm font-medium text-destructive">{icon.error.message}</p>
        <Button onClick={icon.reload}>Try again</Button>
      </div>
    );
  }
  if (!icon.data) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading icon…
      </p>
    );
  }
  // Keyed so the forms start fresh from the saved values after every reload.
  return <IconPanel key={`${icon.data.id}:${icon.data.updatedAt}`} icon={icon.data} tab={tab} onTab={setTab} reload={icon.reload} onClose={onClose} {...rest} />;
}

type PanelProps = Omit<IconDrawerProps, "iconId"> & { icon: IconDetail; tab: Tab; onTab: (tab: Tab) => void; reload: () => void };

function IconPanel({ projectId, icon, tab, onTab, reload, canEdit, folders, idPrefix, onClose, onChanged }: PanelProps) {
  const { showToast } = useToast();
  const [surface] = usePersistentChoice(projectId ?? "unknown", "iconSurface", SURFACES, "theme");
  const [appearance] = useIconAppearance(projectId ?? "unknown");
  const size = appearance.size;
  const [busy, setBusy] = useState<string | null>(null);
  const warnings = iconWarnings(icon);
  const saved = savingsPercent(icon.originalByteSize, icon.byteSize);

  async function copy(label: string, make: () => string) {
    try {
      const ok = await copyText(make());
      showToast(ok ? `Copied ${label}.` : "Could not copy to the clipboard.", ok ? "success" : "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not copy.", "error");
    }
  }

  async function act<T>(name: string, run: () => Promise<T>, then: (result: T) => void) {
    setBusy(name);
    try {
      then(await run());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  }

  const optimize = () =>
    act("optimize", () => optimizeIcon(icon.id), (result) => {
      showToast(result.changed ? `Optimized: ${formatBytes(result.before)} to ${formatBytes(result.after)} (${result.savingsPercent}% smaller). The old version is kept.` : "Already as small as it can be.", "success");
      if (result.changed) {
        reload();
        onChanged();
      }
    });

  const download = () =>
    act("download", () => downloadIcon(icon.id), ({ blob, filename }) => triggerBrowserDownload(blob, filename));

  const trash = () =>
    act("trash", () => deleteIcon(icon.id), () => {
      onChanged();
      onClose();
      showToast(`Moved “${icon.name}” to the trash.`, "success", [
        {
          label: "Undo",
          type: "primary",
          onClick: () => {
            restoreIcon(icon.id).then(onChanged, (err: unknown) => showToast(err instanceof Error ? err.message : "Could not restore the icon.", "error"));
          },
        },
      ]);
    });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">{icon.name}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{`${idPrefix}-${icon.slug}`}</p>
      </div>

      <section aria-label="Preview">
        <div className={cn("flex min-h-44 items-center justify-center rounded-xl border border-border p-6", surfaceClass(surface))} style={surfaceStyle(surface)}>
          <SvgPreview svg={icon.svg} size={size} color={appearance.color} iconStyle={appearance.style} label={`${icon.name} at ${size} pixels`} />
        </div>
      </section>

      <section aria-label="Actions" className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Copy aria-hidden="true" className="h-4 w-4" />} onClick={() => copy("the SVG", () => icon.svg)}>
          Copy SVG
        </Button>
        <Button size="sm" onClick={() => copy("the React component", () => toReactComponent(icon.svg, icon.name))}>
          Copy React
        </Button>
        <Button size="sm" onClick={() => copy("the Vue component", () => toVueComponent(icon.svg))}>
          Copy Vue
        </Button>
        <Button size="sm" icon={<Download aria-hidden="true" className="h-4 w-4" />} loading={busy === "download"} disabled={busy !== null} onClick={download}>
          Download
        </Button>
        {canEdit && (
          <>
            <Button size="sm" icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} loading={busy === "optimize"} disabled={busy !== null} onClick={optimize}>
              Optimize
            </Button>
            <Button size="sm" variant="destructive" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} loading={busy === "trash"} disabled={busy !== null} onClick={trash}>
              Move to trash
            </Button>
          </>
        )}
      </section>

      {warnings.length > 0 && (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{warnings.join(", ")}:</strong> this icon will not convert cleanly to an icon font until it is turned into filled outlines.
        </p>
      )}

      <Tabs
        label="Icon sections"
        value={tab}
        onChange={onTab}
        tabs={[
          { value: "details", label: "Details" },
          { value: "code", label: "Code" },
          { value: "versions", label: `Versions (${icon.versions.length})` },
        ]}
      >
        {tab === "details" && <DetailsTab icon={icon} canEdit={canEdit} folders={folders} saved={saved} onSaved={() => { reload(); onChanged(); }} />}
        {tab === "code" && <CodeTab icon={icon} canEdit={canEdit} onSaved={() => { reload(); onChanged(); }} />}
        {tab === "versions" && (
          <VersionsTab
            icon={icon}
            canEdit={canEdit}
            onRestored={() => {
              reload();
              onChanged();
            }}
          />
        )}
      </Tabs>
    </div>
  );
}

function DetailsTab({ icon, canEdit, folders, saved, onSaved }: { icon: IconDetail; canEdit: boolean; folders: FolderWithCount[]; saved: number; onSaved: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState(icon.name);
  const [folderId, setFolderId] = useState(icon.folderId ?? "");
  const [tagText, setTagText] = useState(icon.tags.join(", "));
  const [codepoint, setCodepoint] = useState(icon.codepoint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = flattenFolderTree(buildFolderTree(folders));
  const problem = codepointProblem(codepoint);

  const patch = {
    ...(name.trim() !== icon.name ? { name: name.trim() } : {}),
    ...((folderId || null) !== icon.folderId ? { folderId: folderId || null } : {}),
    ...(parseTags(tagText).join(",") !== icon.tags.join(",") ? { tags: parseTags(tagText) } : {}),
    ...((codepoint.trim().toUpperCase() || null) !== icon.codepoint ? { codepoint: codepoint.trim().toUpperCase() || null } : {}),
  };
  const changed = Object.keys(patch).length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    if (problem || !changed) return;
    setBusy(true);
    setError(null);
    try {
      await updateIcon(icon.id, patch);
      showToast("Saved.", "success");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form onSubmit={submit} noValidate className="space-y-3">
          <TextField label="Name" value={name} maxLength={100} autoComplete="off" onChange={(event) => setName(event.target.value)} hint="Changing the name also changes the icon's id." />
          <SelectField label="Folder" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Uncategorized (project root)</option>
            {options.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {`${"  ".repeat(folder.depth)}${folder.name}`}
              </option>
            ))}
          </SelectField>
          <TextField label="Tags" value={tagText} autoComplete="off" hint="Separated by commas." onChange={(event) => setTagText(event.target.value)} />
          <TextField label="Font codepoint" value={codepoint} autoComplete="off" spellCheck={false} maxLength={4} className="font-mono" hint="Optional: 4 hex digits from E000 to F8FF, for example E001. Kept the same every time a font is built." error={problem ?? undefined} onChange={(event) => setCodepoint(event.target.value)} />
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy} disabled={!changed || problem !== null}>
            Save changes
          </Button>
        </form>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Folder</dt>
          <dd>{folderPath(folders, icon.folderId)}</dd>
          <dt className="text-muted-foreground">Tags</dt>
          <dd>{icon.tags.length > 0 ? icon.tags.join(", ") : "None"}</dd>
          <dt className="text-muted-foreground">Font codepoint</dt>
          <dd className="font-mono">{icon.codepoint ?? "Not set"}</dd>
        </dl>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd>
          {formatBytes(icon.byteSize)}
          {saved > 0 && <span className="text-muted-foreground"> (was {formatBytes(icon.originalByteSize)}, {saved}% smaller)</span>}
        </dd>
        <dt className="text-muted-foreground">Canvas</dt>
        <dd>
          {icon.width} × {icon.height}, viewBox <span className="font-mono text-xs">{icon.viewBox}</span>
        </dd>
        <dt className="text-muted-foreground">Added</dt>
        <dd>{formatDate(icon.createdAt)}</dd>
        <dt className="text-muted-foreground">Last changed</dt>
        <dd>{formatRelative(icon.updatedAt)}</dd>
      </dl>
    </div>
  );
}

// Live preview of code being typed. It has not been cleaned by the server yet, so it is shown as an image: an SVG used as an image can never run scripts or load other files.
function DraftPreview({ code }: { code: string }) {
  return <img alt="Preview of the code" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`} className="h-24 w-24 object-contain" />;
}

function CodeTab({ icon, canEdit, onSaved }: { icon: IconDetail; canEdit: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const [code, setCode] = useState(icon.svg);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = code !== icon.svg;

  let react = "";
  let vue = "";
  try {
    react = toReactComponent(icon.svg, icon.name);
    vue = toVueComponent(icon.svg);
  } catch {
    // The snippets are a convenience; the editor still works.
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateIcon(icon.id, { rawSvg: code });
      showToast("Saved. The previous version is kept.", "success");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <TextAreaField label="SVG code" value={code} readOnly={!canEdit} rows={10} spellCheck={false} className="font-mono text-xs" onChange={(event) => setCode(event.target.value)} />
      {canEdit && (
        <>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-white p-1">
              <DraftPreview code={code} />
            </div>
            <p className="text-xs text-muted-foreground">Live preview of what you typed. It is cleaned and checked when you save.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={save}>
              Save SVG
            </Button>
            <Button variant="secondary" disabled={!dirty || busy} onClick={() => { setCode(icon.svg); setError(null); }}>
              Revert
            </Button>
          </div>
        </>
      )}

      {react && (
        <>
          <Snippet title="React component (TSX)" code={react} />
          <Snippet title="Vue 3 component" code={vue} />
        </>
      )}
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const { showToast } = useToast();
  return (
    <section aria-label={title}>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const ok = await copyText(code);
            showToast(ok ? "Copied." : "Could not copy to the clipboard.", ok ? "success" : "error");
          }}
        >
          Copy
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">
        <code>{code}</code>
      </pre>
    </section>
  );
}

function VersionsTab({ icon, canEdit, onRestored }: { icon: IconDetail; canEdit: boolean; onRestored: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (icon.versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No earlier versions yet. One is saved each time the SVG changes (the newest 20 are kept).</p>;
  }

  async function restore(versionId: string) {
    setBusy(versionId);
    try {
      await restoreVersion(icon.id, versionId);
      showToast("Restored. The version you replaced is kept too.", "success");
      onRestored();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not restore.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul aria-label="Earlier versions" className="divide-y divide-border rounded-lg border border-border text-sm">
      {icon.versions.map((version, index) => (
        <li key={version.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span>
            {index === 0 ? "Most recent change" : formatDate(version.createdAt)}
            <span className="block text-xs text-muted-foreground">
              {formatRelative(version.createdAt)} · {formatBytes(version.byteSize)}
            </span>
          </span>
          {canEdit && (
            <Button size="sm" loading={busy === version.id} disabled={busy !== null} onClick={() => restore(version.id)} aria-label={`Restore the version from ${formatRelative(version.createdAt)}`}>
              Restore
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
