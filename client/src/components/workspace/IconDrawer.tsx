// The panel that opens when an icon is clicked. Preview at the icon's folder-specific size and colour on the background chosen in the toolbar; quick actions (copy as SVG, React or Vue, download, optimize); and the editable details (name, folder, tags, codepoint). People who cannot edit the project see everything read-only.
import { ChevronDown, Copy, Download, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { deleteIcon, downloadIcon, getIcon, restoreIcon, updateIcon } from "../../api/icons";
import type { FolderWithCount, IconDetail, ProjectPurpose } from "../../api/types";
import { useToast } from "../../context/ToastContext";
import { useIconAppearance } from "../../hooks/useIconAppearance";
import { useResource } from "../../hooks/useResource";
import { usePersistentChoice } from "../../hooks/usePersistentChoice";
import { cn } from "../../lib/cn";
import { copyText } from "../../lib/clipboard";
import { codepointProblem } from "../../lib/codepoint";
import { formatBytes, formatDate, formatRelative } from "../../lib/format";
import { iconWarnings } from "../../lib/iconInfo";
import { SURFACES, surfaceClass, surfaceStyle } from "../../lib/previewSurface";
import { toReactComponent, toVueComponent } from "../../lib/svgSnippets";
import { parseTags } from "../../lib/upload";
import { triggerBrowserDownload } from "../../utils/zipBundle";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import { TextField } from "../ui/Fields";
import SvgPreview from "../ui/SvgPreview";
import FolderDropdownSelect from "./FolderDropdownSelect";


type IconDrawerProps = {
  projectId?: string;
  // The icon to show, or null when the drawer is closed.
  iconId: string | null;
  canEdit: boolean;
  folders: FolderWithCount[];
  // Used to show the icon's id as it will appear in a sprite or font, for example "feather-arrow-left".
  idPrefix: string;
  purpose?: ProjectPurpose;
  onClose: () => void;
  // Something changed (edit, optimize, restore, trash): refresh the lists behind the drawer.
  onChanged: () => void;
};

export default function IconDrawer({ iconId, onClose, ...rest }: IconDrawerProps) {
  return (
    <Dialog open={iconId !== null} onClose={onClose} title="Icon Details" placement="drawer" size="sm">
      {iconId && <DrawerBody key={iconId} iconId={iconId} onClose={onClose} {...rest} />}
    </Dialog>
  );
}

function DrawerBody({ iconId, onClose, ...rest }: Omit<IconDrawerProps, "iconId"> & { iconId: string }) {
  const icon = useResource(`icon:${iconId}`, () => getIcon(iconId));

  if (icon.error && !icon.data) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm font-medium text-destructive">{icon.error.message}</p>
        <Button onClick={icon.reload}>Try Again</Button>
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
  return <IconPanel key={`${icon.data.id}:${icon.data.updatedAt}`} icon={icon.data} reload={icon.reload} onClose={onClose} {...rest} />;
}

type PanelProps = Omit<IconDrawerProps, "iconId"> & { icon: IconDetail; reload: () => void };

function IconPanel({ projectId, icon, reload, canEdit, folders, idPrefix, purpose = "font", onClose, onChanged }: PanelProps) {
  const { showToast } = useToast();
  const [surface] = usePersistentChoice(projectId ?? "unknown", "iconSurface", SURFACES, "theme");
  const [appearance] = useIconAppearance(projectId ?? "unknown", icon.folderId);
  const size = appearance.size;
  const [busy, setBusy] = useState<string | null>(null);
  const warnings = iconWarnings(icon);

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

  // const optimize = () =>
  //   act("optimize", () => optimizeIcon(icon.id), (result) => {
  //     showToast(result.changed ? `Optimized: ${formatBytes(result.before)} to ${formatBytes(result.after)} (${result.savingsPercent}% smaller). The old version is kept.` : "Already as small as it can be.", "success");
  //     if (result.changed) {
  //       reload();
  //       onChanged();
  //     }
  //   });

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
          <SvgPreview svg={icon.svg} size={size} color={appearance.color} label={`${icon.name} at ${size} Pixels`} />
        </div>
      </section>

      <dl aria-label="Icon facts" className="grid grid-cols-4 gap-2 text-sm">
        <Fact label="Canvas" value={`${icon.width} × ${icon.height}`} />
        <Fact label="Size" value={formatBytes(icon.byteSize)} />
        <Fact label="Added on" value={formatDate(icon.createdAt)} />
        <Fact label="Last updated" value={formatRelative(icon.updatedAt)} />
      </dl>

      <section aria-label="Actions" className="flex flex-wrap items-center gap-2">
        <CopySplitButton
          onCopySvg={() => copy("the SVG", () => icon.svg)}
          onCopyReact={() => copy("the React component", () => toReactComponent(icon.svg, icon.name))}
          onCopyVue={() => copy("the Vue component", () => toVueComponent(icon.svg))}
        />
        <Button variant="secondary" icon={<Download aria-hidden="true" className="h-4 w-4" />} loading={busy === "download"} disabled={busy !== null} onClick={download}>
          Download
        </Button>
        {/* {canEdit && (
          <Button variant="secondary" icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} loading={busy === "optimize"} disabled={busy !== null} onClick={optimize}>
            Optimize
          </Button>
        )} */}
      </section>

      {warnings.length > 0 && (
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{warnings.join(", ")}:</strong> this icon will not convert cleanly to an icon font until it is turned into filled outlines.
        </p>
      )}

      <DetailsTab icon={icon} canEdit={canEdit} folders={folders} purpose={purpose} onSaved={() => { reload(); onChanged(); }} onTrash={trash} busyAction={busy !== null} />
    </div>
  );
}

function DetailsTab({ icon, canEdit, folders, purpose, onSaved, onTrash, busyAction }: { icon: IconDetail; canEdit: boolean; folders: FolderWithCount[]; purpose: ProjectPurpose; onSaved: () => void; onTrash: () => void; busyAction: boolean }) {
  const { showToast } = useToast();
  const [name, setName] = useState(icon.name);
  const [folderId, setFolderId] = useState(icon.folderId ?? "");
  const [tagText, setTagText] = useState(icon.tags.join(", "));
  const [codepoint, setCodepoint] = useState(icon.codepoint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = purpose === "font" ? codepointProblem(codepoint) : null;

  function reset() {
    setName(icon.name);
    setFolderId(icon.folderId ?? "");
    setTagText(icon.tags.join(", "));
    setCodepoint(icon.codepoint ?? "");
    setError(null);
  }

  const patch = {
    ...(name.trim() !== icon.name ? { name: name.trim() } : {}),
    ...((folderId || null) !== icon.folderId ? { folderId: folderId || null } : {}),
    ...(parseTags(tagText).join(",") !== icon.tags.join(",") ? { tags: parseTags(tagText) } : {}),
    ...(purpose === "font" && (codepoint.trim().toUpperCase() || null) !== icon.codepoint ? { codepoint: codepoint.trim().toUpperCase() || null } : {}),
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
      <form onSubmit={submit} noValidate className="space-y-3">
        <TextField label="Name" value={name} maxLength={100} autoComplete="off" disabled={!canEdit} onChange={(event) => setName(event.target.value)} hint="Changing the name also changes the icon's id." />
        <FolderDropdownSelect label="Folder" value={folderId} folders={folders} onChange={setFolderId} disabled={!canEdit} />
        <TextField label="Tags" value={tagText} autoComplete="off" disabled={!canEdit} hint="Separated by commas." onChange={(event) => setTagText(event.target.value)} />
        {purpose === "font" && <TextField label="Font Codepoint" value={codepoint} autoComplete="off" spellCheck={false} maxLength={4} disabled={!canEdit} className="font-mono" hint="Optional: 4 hex digits from E000 to F8FF, for example E001. Kept the same every time a font is built." error={problem ?? undefined} onChange={(event) => setCodepoint(event.target.value)} />}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <button type="button" disabled={busyAction} onClick={onTrash} className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive transition-colors hover:opacity-80 disabled:pointer-events-none disabled:opacity-50">
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Move to Trash
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!changed || problem !== null}>
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// One Canvas / Size / Added / Updated fact in the stats row.
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// A split button: the main part copies the SVG; the chevron opens a small menu to copy the React or Vue component instead.
function CopySplitButton({ onCopySvg, onCopyReact, onCopyVue }: { onCopySvg: () => void; onCopyReact: () => void; onCopyVue: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function choose(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <Button variant="primary" className="rounded-r-none" icon={<Copy aria-hidden="true" className="h-4 w-4" />} onClick={onCopySvg}>
        Copy
      </Button>
      <Button
        variant="primary"
        aria-label="More copy options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="-ml-px rounded-l-none border-l border-primary-foreground/20 px-2"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </Button>
      {open && (
        <div role="menu" aria-label="Copy as" className="absolute left-0 top-full z-30 mt-1 min-w-40 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <button type="button" role="menuitem" className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => choose(onCopySvg)}>
            Copy SVG
          </button>
          <button type="button" role="menuitem" className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => choose(onCopyReact)}>
            Copy React
          </button>
          <button type="button" role="menuitem" className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => choose(onCopyVue)}>
            Copy Vue
          </button>
        </div>
      )}
    </div>
  );
}
