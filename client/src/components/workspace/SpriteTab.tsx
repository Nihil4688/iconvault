// The Sprite Builder, laid out like the Font Builder and like Icon Vault's sprite page: the actions in the project bar (Download sprite ZIP is the main one, with Copy sprite), then three columns: 1. Scope selection (whole project, a folder or the chosen icons, with the icon checklist), 2. Sprite architecture (symbols, a stack, or symbols with a CSS stylesheet), 3. Processing options (the symbol id pattern, colours to currentColor, namespaced ids). The sprite builds by itself in the browser whenever the icons or an option change, so the ZIP (sprite, grid sprite, demo page, preview image) is ready to download as soon as the page shows it. Below: the symbol ids with the code for each, and the sprite build history (there is no preview panel; the demo page is inside the ZIP). Anyone who can see the project can build and download; the ZIPs editors download are kept in the history.
import { CheckSquare, Copy, FileArchive } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { uploadSpriteBuild } from "../../api/sprites";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/workspaceContext";
import { useResource } from "../../hooks/useResource";
import { copyText } from "../../lib/clipboard";
import { buildFolderTree, flattenFolderTree, totalIconCount } from "../../lib/folderTree";
import { formatBytes, pluralize } from "../../lib/format";
import { loadAllIcons, readBuildSelection } from "../../lib/loadAllIcons";
import { DEFAULT_SPRITE_OPTIONS, buildSprite, idPatternProblem, snippetFor, type SpriteMode } from "../../lib/spriteBuild";
import { buildDemoHtml, buildGridSpriteXml } from "../../utils/buildDemo";
import { renderSpritePreviewPng } from "../../utils/previewPng";
import { createZip, triggerBrowserDownload } from "../../utils/zipBundle";
import { Button } from "../ui/Button";
import { SelectField, TextField } from "../ui/Fields";
import IconChecklistDialog from "./IconChecklistDialog";
import SpriteHistory from "./SpriteHistory";

const MAX_LISTED_IDS = 200;
const columnHeading = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

const MODES: { value: SpriteMode; label: string; hint: string }[] = [
  { value: "symbol", label: "Symbol sprite (recommended)", hint: "Uses <symbol> with <use href=\"#id\">" },
  { value: "stack", label: "Stack sprite", hint: "Uses :target CSS, for <img> or backgrounds" },
  { value: "css", label: "CSS companion sprite", hint: "Symbols plus a sprite.css stylesheet" },
];

export default function SpriteTab() {
  const { project, folderList, iconsVersion, actionsSlot } = useWorkspace();
  const { showToast } = useToast();
  const canEdit = project.access.canEdit;
  // Icons handed over by the bulk bar ("Build sprite") arrive as the chosen icons.
  const handed = readBuildSelection(useLocation().state);
  const [chosen, setChosen] = useState<string[] | null>(handed?.iconIds ?? null);
  const [choiceVersion, setChoiceVersion] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [scopeKind, setScopeKind] = useState<"all" | "folder" | "selected">(handed ? "selected" : "all");
  const [folderChoice, setFolderChoice] = useState("");
  const scope = scopeKind === "folder" ? folderChoice : scopeKind;
  const [mode, setMode] = useState<SpriteMode>(DEFAULT_SPRITE_OPTIONS.mode);
  const [idPattern, setIdPattern] = useState(DEFAULT_SPRITE_OPTIONS.idPattern);
  const [stripColors, setStripColors] = useState(DEFAULT_SPRITE_OPTIONS.stripColors);
  const [namespaceIds, setNamespaceIds] = useState(DEFAULT_SPRITE_OPTIONS.namespaceIds);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [filter, setFilter] = useState("");
  const folderOptions = flattenFolderTree(buildFolderTree(folderList.folders));
  const fileName = project.prefix || "sprite";
  const waitingForFolder = scopeKind === "folder" && !folderChoice;
  const patternProblem = idPatternProblem(idPattern);

  const loaded = useResource(waitingForFolder ? null : `sprite:${project.id}:${scope}:${choiceVersion}:${iconsVersion}`, async () => {
    if (scope !== "selected") return loadAllIcons(project.id, scope);
    const wanted = new Set(chosen ?? []);
    return (await loadAllIcons(project.id)).filter((icon) => wanted.has(icon.id));
  });
  const built = useMemo(
    () => (loaded.data ? buildSprite(loaded.data.map((icon) => ({ name: icon.name, slug: icon.slug, svg: icon.svg ?? "" })), project.prefix, { mode, idPattern, stripColors, namespaceIds }) : null),
    [loaded.data, project.prefix, mode, idPattern, stripColors, namespaceIds],
  );
  const sizeBytes = built ? new Blob([built.xml]).size : 0;
  const shownIds = built ? built.ids.filter((id) => id.includes(filter.trim().toLowerCase())) : [];
  const ready = built !== null && built.ids.length > 0;
  const folderNode = folderOptions.find((folder) => folder.id === folderChoice);
  const inScope = scopeKind === "selected" ? (chosen?.length ?? 0) : scopeKind === "all" ? project.iconCount : folderNode ? totalIconCount(folderNode) : 0;

  useEffect(() => {
    if (ready) showToast("Sprite generated successfully.", "success");
  }, [built, ready, showToast]);

  async function copyAndToast(text: string, what: string) {
    const ok = await copyText(text);
    showToast(ok ? `Copied ${what}.` : "Could not copy to the clipboard.", ok ? "success" : "error");
  }

  async function downloadBundle() {
    if (!built || built.ids.length === 0) return;
    setBundleBusy(true);
    try {
      const entries: { name: string; data: string | Uint8Array }[] = [
        { name: `${fileName}.svg`, data: built.xml },
        { name: "demo.html", data: buildDemoHtml(built.ids, built.symbolXml) },
        { name: `${fileName}-grid.svg`, data: buildGridSpriteXml(built.symbolXml, built.ids) },
      ];
      if (built.css) entries.push({ name: `${fileName}.css`, data: built.css });
      const png = await renderSpritePreviewPng(built.symbolXml, built.ids);
      if (png) entries.push({ name: "preview.png", data: new Uint8Array(await png.arrayBuffer()) });
      const zip = createZip(entries);
      triggerBrowserDownload(zip, `${fileName}-bundle.zip`);
      showToast("Sprite ZIP downloaded.", "success");
      // An editor's download is kept in the history (best effort: it must not turn the download into a failure).
      if (canEdit) {
        try {
          await uploadSpriteBuild(project.id, zip, { mode: built.mode, iconCount: built.ids.length });
          setHistoryVersion((value) => value + 1);
        } catch {
          // The file was downloaded; only the history entry is missing.
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not build the sprite ZIP.", "error");
    } finally {
      setBundleBusy(false);
    }
  }

  // The actions sit in the project bar (like Upload icons on the Icons screen); without a bar they show above the settings.
  const actions = (
    <div role="group" aria-label="Sprite actions" className="flex flex-wrap items-center gap-2">
      <Button variant="primary" className="h-9" icon={<FileArchive aria-hidden="true" className="h-4 w-4" />} onClick={() => void downloadBundle()} loading={bundleBusy} disabled={!ready}>
        Download sprite ZIP
      </Button>
      <Button className="h-9" icon={<Copy aria-hidden="true" className="h-4 w-4" />} onClick={() => built && void copyAndToast(built.xml, "the sprite")} disabled={!ready}>
        Copy sprite
      </Button>
    </div>
  );

  return (
    <div>
      {actionsSlot ? createPortal(actions, actionsSlot) : <div className="mb-4 flex justify-end">{actions}</div>}

      <div className="grid gap-4 rounded-2xl border border-border p-4 md:grid-cols-3 md:gap-6">
        <section aria-labelledby="sprite-scope" className="space-y-4">
          <fieldset>
            <legend id="sprite-scope" className={columnHeading}>
              1. Scope selection
            </legend>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="sprite-scope" checked={scopeKind === "all"} onChange={() => setScopeKind("all")} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                {`Whole project (${pluralize(project.iconCount, "icon")})`}
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="sprite-scope" checked={scopeKind === "folder"} onChange={() => setScopeKind("folder")} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Selected folder
              </label>
              {scopeKind === "folder" && (
                <SelectField label="Folder" hideLabel value={folderChoice} onChange={(event) => setFolderChoice(event.target.value)}>
                  <option value="">Choose a folder…</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {`${"  ".repeat(folder.depth)}${folder.name} (${pluralize(totalIconCount(folder), "icon")})`}
                    </option>
                  ))}
                </SelectField>
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="sprite-scope"
                  checked={scopeKind === "selected"}
                  onChange={() => {
                    setScopeKind("selected");
                    // Nothing chosen yet: open the checklist to choose.
                    if (!chosen) setChoosing(true);
                  }}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {`Selected icons (${chosen?.length ?? 0})`}
              </label>
            </div>
          </fieldset>

          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckSquare aria-hidden="true" className="h-4 w-4 text-primary" />
                Icon checklist
              </span>
              <span className="text-primary" aria-label={`${inScope} of ${project.iconCount} icons included`}>
                {inScope} / {project.iconCount}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Only checked icons are bundled into the sprite.</p>
            <Button className="mt-2 w-full" size="sm" onClick={() => setChoosing(true)}>
              Review / edit checklist
            </Button>
          </div>
        </section>

        <section aria-labelledby="sprite-architecture" className="space-y-3">
          <h2 id="sprite-architecture" className={columnHeading}>
            2. Sprite architecture
          </h2>
          <fieldset className="space-y-2.5 text-sm">
            <legend className="sr-only">Sprite architecture</legend>
            {MODES.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-2">
                <input type="radio" name="sprite-mode" checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section aria-labelledby="sprite-options" className="space-y-3">
          <h2 id="sprite-options" className={columnHeading}>
            3. Processing options
          </h2>
          <TextField label="Symbol id pattern" value={idPattern} maxLength={60} autoComplete="off" spellCheck={false} error={patternProblem ?? undefined} hint="{prefix} is the project prefix, {name} the icon name." onChange={(event) => setIdPattern(event.target.value)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={stripColors} onChange={(event) => setStripColors(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Convert colours to currentColor (monochrome)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={namespaceIds} onChange={(event) => setNamespaceIds(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Namespace gradient and mask ids (prevents clashes)
          </label>
          {patternProblem && <p className="text-xs text-muted-foreground">Until that is fixed, ids use {DEFAULT_SPRITE_OPTIONS.idPattern}.</p>}
        </section>
      </div>

      {waitingForFolder ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Choose a folder to build its sprite.</p>
      ) : loaded.error && !loaded.data ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-6 text-center">
          <p className="font-medium text-destructive">{loaded.error.message}</p>
          <Button className="mt-3" onClick={loaded.reload}>
            Try again
          </Button>
        </div>
      ) : !built ? (
        <div aria-busy="true" aria-label="Building the sprite" className="mt-4 h-64 animate-pulse rounded-xl bg-muted" />
      ) : built.ids.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-base font-semibold">There is nothing to compile yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">{project.access.canAddIcons ? "Add icons, or import an existing sprite from the Icons screen's Upload icons menu, and the sprite is built here." : "This project has no icons in that selection."}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p role="status" className="text-sm">
            <span className="font-semibold">{pluralize(built.ids.length, "symbol")}</span>
            <span className="text-muted-foreground">, {formatBytes(sizeBytes)}</span>
          </p>

          {built.skipped.length > 0 && (
            <p role="note" className="rounded-lg border border-amber-500/40 bg-muted px-3 py-2 text-sm">
              {pluralize(built.skipped.length, "icon")} could not be included because the SVG could not be read: {built.skipped.slice(0, 5).join(", ")}
              {built.skipped.length > 5 ? "…" : ""}
            </p>
          )}

          <section aria-labelledby="sprite-ids">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="sprite-ids" className="text-sm font-semibold">
                Symbol ids
              </h3>
              {built.ids.length > 10 && <input type="search" aria-label="Filter symbol ids" placeholder="Filter ids" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />}
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownIds.slice(0, MAX_LISTED_IDS).map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => copyAndToast(snippetFor(built.mode, id, `${fileName}.svg`), `the code for ${id}`)} aria-label={`Copy code for ${id}`} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-left font-mono text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="truncate">{id}</span>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
            {shownIds.length > MAX_LISTED_IDS && <p className="mt-2 text-sm text-muted-foreground">Showing the first {MAX_LISTED_IDS} of {shownIds.length}. Use the filter to find others.</p>}
            {shownIds.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No ids match “{filter}”.</p>}
          </section>
        </div>
      )}

      <SpriteHistory projectId={project.id} canEdit={canEdit} version={historyVersion} />

      <IconChecklistDialog
        open={choosing}
        mode="sprite"
        projectId={project.id}
        folders={folderList.folders}
        initialIds={scopeKind === "selected" ? chosen : null}
        onClose={() => setChoosing(false)}
        onConfirm={(iconIds) => {
          setChoosing(false);
          setChosen(iconIds);
          setChoiceVersion((value) => value + 1);
          setScopeKind("selected");
        }}
      />
    </div>
  );
}
