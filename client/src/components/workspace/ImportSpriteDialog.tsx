// Import an existing sprite: pick a sprite .svg file, see how many symbols it holds, choose a folder and what to do when a name is taken, and each symbol becomes an icon in the project (cleaned and optimized like any upload). The result lists anything that could not be added.
import { CheckCircle2 } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { uploadIcons } from "../../api/icons";
import type { DuplicateStrategy, FolderWithCount, UploadSummary } from "../../api/types";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { pluralize } from "../../lib/format";
import { readFileText } from "../../lib/readFile";
import { spriteToFiles, type SpriteImport } from "../../lib/spriteBuild";
import { MAX_FILE_BYTES, mergeSummaries, toBatches } from "../../lib/upload";
import { Button } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { SelectField } from "../ui/Fields";

type ImportSpriteDialogProps = {
  open: boolean;
  projectId: string;
  prefix: string;
  folders: FolderWithCount[];
  defaultFolderId: string | null;
  onClose: () => void;
  // Called as soon as something was added so the lists can refresh behind the dialog.
  onImported: (summary: UploadSummary) => void;
};

export default function ImportSpriteDialog({ open, onClose, ...rest }: ImportSpriteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Import a sprite" description="Turn the symbols of an existing sprite file into icons in this project." size="lg">
      <ImportForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

function ImportForm({ projectId, prefix, folders, defaultFolderId, onClose, onImported }: Omit<ImportSpriteDialogProps, "open">) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SpriteImport | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [optimize, setOptimize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const folderOptions = flattenFolderTree(buildFolderTree(folders));

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setParsed(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    if (!/\.svg$/i.test(file.name)) return setError("Choose a sprite file ending in .svg.");
    if (file.size > MAX_FILE_BYTES) return setError("That file is larger than 25 MB.");
    try {
      const result = spriteToFiles(await readFileText(file), prefix);
      if (!result) setError("This file has no symbols, so it is not a sprite. Use Add icons for single icons.");
      else setParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed) return;
    setBusy(true);
    setError(null);
    const results: UploadSummary[] = [];
    try {
      for (const batch of toBatches(parsed.files)) {
        results.push(await uploadIcons(projectId, batch, { folderId: folderId || null, strategy, optimize }));
      }
      const merged = mergeSummaries(results);
      setSummary(merged);
      onImported(merged);
    } catch (err) {
      // Batches that already went through are kept; say so, so nothing is imported twice by accident.
      const done = mergeSummaries(results);
      if (done.created.length + done.replaced.length > 0) {
        setSummary({ ...done, errors: [...done.errors, { file: "The rest of the symbols", message: err instanceof Error ? err.message : "The import stopped." }] });
        onImported(done);
      } else {
        setError(err instanceof Error ? err.message : "The import failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-semibold">{summary.created.length > 0 ? `Imported ${pluralize(summary.created.length, "icon")}.` : "Nothing new was imported."}</p>
            <ul className="mt-1 text-muted-foreground">
              {summary.replaced.length > 0 && <li>{pluralize(summary.replaced.length, "icon")} replaced.</li>}
              {summary.skipped.length > 0 && <li>{pluralize(summary.skipped.length, "icon")} skipped.</li>}
              {summary.errors.length > 0 && <li>{pluralize(summary.errors.length, "symbol")} could not be imported.</li>}
            </ul>
          </div>
        </div>
        {summary.errors.length > 0 && (
          <ul aria-label="Symbols that could not be imported" className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {summary.errors.map((item, index) => (
              <li key={`${item.file}-${index}`} className="px-3 py-2">
                <span className="font-medium">{item.file}</span>
                <span className="block text-muted-foreground">{item.message}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.skipped.length > 0 && (
          <ul aria-label="Skipped symbols" className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
            {summary.skipped.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.name}: {item.reason}
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
      <div>
        <label htmlFor="import-sprite-file" className="mb-1 block text-sm font-medium">
          Sprite file
        </label>
        <input id="import-sprite-file" type="file" accept=".svg,image/svg+xml" onChange={choose} disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium" />
        {parsed && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{fileName}</span> holds {pluralize(parsed.count, "symbol")}. Each one becomes an icon.
          </p>
        )}
      </div>

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
        <Button type="submit" variant="primary" disabled={!parsed} loading={busy}>
          {parsed ? `Import ${pluralize(parsed.count, "icon")}` : "Import"}
        </Button>
      </DialogFooter>
    </form>
  );
}
