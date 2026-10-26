// Import the glyphs of an existing font as icons: pick a TTF, OTF, WOFF, WOFF2 or SVG font (and optionally a CSS or JSON file that names the characters). The server reports what the font holds before anything is added; icon fonts keep their icons in the Private Use Area, so by default only those are imported. The result lists anything that could not be added.
import { CheckCircle2 } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { importFont } from "../../api/fonts";
import type { DuplicateStrategy, FolderWithCount, FontImportPreview, FontImportResult } from "../../api/types";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";

type ImportFontDialogProps = {
  open: boolean;
  projectId: string;
  folders: FolderWithCount[];
  defaultFolderId: string | null;
  onClose: () => void;
  // Called as soon as something was added so the lists can refresh behind the dialog.
  onImported: (result: FontImportResult) => void;
};

export default function ImportFontDialog({ open, onClose, ...rest }: ImportFontDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Import a font" description="Turn the glyphs of an existing icon font into icons in this project." size="lg">
      <ImportForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

function isFinal(result: FontImportPreview | FontImportResult): result is FontImportResult {
  return !result.dryRun;
}

function ImportForm({ projectId, folders, defaultFolderId, onClose, onImported }: Omit<ImportFontDialogProps, "open">) {
  const [font, setFont] = useState<File | null>(null);
  const [mapping, setMapping] = useState<File | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [optimize, setOptimize] = useState(true);
  const [privateUseOnly, setPrivateUseOnly] = useState(true);
  const [preview, setPreview] = useState<FontImportPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FontImportResult | null>(null);
  const folderOptions = flattenFolderTree(buildFolderTree(folders));

  // Asks the server what the font holds, whenever the font, the map or the "only icon characters" choice changes.
  async function check(nextFont: File | null, nextMapping: File | null, nextPrivateUseOnly: boolean) {
    setPreview(null);
    setError(null);
    if (!nextFont) return;
    setChecking(true);
    try {
      const answer = await importFont(projectId, nextFont, nextMapping, { dryRun: true, privateUseOnly: nextPrivateUseOnly });
      setPreview(answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the font.");
    } finally {
      setChecking(false);
    }
  }

  function chooseFont(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setFont(file);
    void check(file, mapping, privateUseOnly);
  }

  function chooseMapping(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setMapping(file);
    void check(font, file, privateUseOnly);
  }

  function togglePrivateUse(checked: boolean) {
    setPrivateUseOnly(checked);
    void check(font, mapping, checked);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!font || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await importFont(projectId, font, mapping, { folderId: folderId || null, strategy, optimize, privateUseOnly });
      if (isFinal(answer)) {
        setResult(answer);
        onImported(answer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-semibold">{result.created.length > 0 ? `Imported ${pluralize(result.created.length, "icon")}.` : "Nothing new was imported."}</p>
            <ul className="mt-1 text-muted-foreground">
              {result.replaced.length > 0 && <li>{pluralize(result.replaced.length, "icon")} replaced.</li>}
              {result.skipped.length > 0 && <li>{pluralize(result.skipped.length, "icon")} skipped.</li>}
              <li>
                {pluralize(result.codepointsKept, "character")} kept
                {result.codepointsDropped > 0 ? `, ${pluralize(result.codepointsDropped, "character")} already used here and not kept` : ""}.
              </li>
              {result.errors.length > 0 && <li>{pluralize(result.errors.length, "glyph")} could not be imported.</li>}
            </ul>
          </div>
        </div>
        {result.errors.length > 0 && (
          <ul aria-label="Glyphs that could not be imported" className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {result.errors.map((item, index) => (
              <li key={`${item.file}-${index}`} className="px-3 py-2">
                <span className="font-medium">{item.file}</span>
                <span className="block text-muted-foreground">{item.message}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="import-font-file" className="mb-1 block text-sm font-medium">
            Font file
          </label>
          <input id="import-font-file" type="file" accept=".ttf,.otf,.woff,.woff2,.svg,font/*,image/svg+xml" onChange={chooseFont} disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium" />
        </div>
        <div>
          <label htmlFor="import-font-map" className="mb-1 block text-sm font-medium">
            Names (optional)
          </label>
          <input id="import-font-map" type="file" accept=".css,.json,text/css,application/json" onChange={chooseMapping} disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          <p className="mt-1 text-xs text-muted-foreground">A CSS file with rules like .icon-home:before, or a JSON map, gives the icons real names.</p>
        </div>
      </div>

      {font && (
        <p role="status" className="text-sm text-muted-foreground">
          {checking ? (
            "Reading the font…"
          ) : preview ? (
            <>
              <span className="font-medium text-foreground">{font.name}</span> ({preview.kind}) has {pluralize(preview.total, "glyph")}; <span className="font-medium text-foreground">{pluralize(preview.importable, "icon")}</span> will be imported
              {preview.sample.length > 0 ? `, for example ${preview.sample.slice(0, 5).map((glyph) => glyph.name).join(", ")}` : ""}.
              {preview.truncated ? ` Only the first ${preview.limit} are read.` : ""}
            </>
          ) : null}
        </p>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={privateUseOnly} onChange={(event) => togglePrivateUse(event.target.checked)} disabled={busy} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        Only icon characters (the Private Use Area; turn off to import every glyph, letters too)
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Folder" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
          <option value="">Uncategorized (project root)</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {`${"  ".repeat(folder.depth)}${folder.name}`}
            </option>
          ))}
        </SelectField>
        <SelectField label="If an icon with that name exists" value={strategy} onChange={(event) => setStrategy(event.target.value as DuplicateStrategy)}>
          <option value="rename">Keep both (add a number)</option>
          <option value="replace">Replace it (the old one is kept as a version)</option>
          <option value="skip">Skip</option>
        </SelectField>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={optimize} onChange={(event) => setOptimize(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        Optimize to make the icons smaller
      </label>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!preview || checking} loading={busy}>
          {preview ? `Import ${pluralize(preview.importable, "icon")}` : "Import"}
        </Button>
      </DialogFooter>
    </form>
  );
}
