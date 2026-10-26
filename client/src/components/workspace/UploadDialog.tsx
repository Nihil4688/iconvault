// Add icons to a project: upload SVG files and ZIP archives (large selections are sent in batches, and a ZIP's folders are recreated), or paste SVG code. Options: which folder, what to do when a name is taken, whether to optimize, and tags. After an upload the full result is shown, including every file that could not be added and why.
import { CheckCircle2, FileUp, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { pasteIcon, uploadIcons } from "../../api/icons";
import type { DuplicateStrategy, FolderWithCount, PasteResult, UploadSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";
import { formatBytes, pluralize } from "../../lib/format";
import { checkFiles, mergeSummaries, parseTags, toBatches } from "../../lib/upload";
import { Button, IconButton } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { TextAreaField, TextField, SelectField } from "../ui/Fields";
import Tabs from "../ui/Tabs";

type UploadDialogProps = {
  open: boolean;
  projectId: string;
  folders: FolderWithCount[];
  // The folder to start with (the one currently open), or null for the project root.
  defaultFolderId: string | null;
  onClose: () => void;
  // Called as soon as something was added, so the lists can refresh behind the dialog.
  onUploaded: (summary: UploadSummary) => void;
  onPasted: (result: PasteResult) => void;
  // Which tab to show first.
  initialTab?: "files" | "paste";
};

export default function UploadDialog({ open, onClose, ...rest }: UploadDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Add icons" description="Upload SVG files or ZIP archives, or paste SVG code." size="lg">
      <UploadForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

type Tab = "files" | "paste";

function UploadForm({ projectId, folders, defaultFolderId, onClose, onUploaded, onPasted, initialTab = "files" }: Omit<UploadDialogProps, "open">) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [files, setFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<{ file: string; message: string }[]>([]);
  const [pasteName, setPasteName] = useState("");
  const [pasteCode, setPasteCode] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [optimize, setOptimize] = useState(true);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderOptions = flattenFolderTree(buildFolderTree(folders));

  function addFiles(chosen: File[]) {
    const checked = checkFiles([...files, ...chosen]);
    setFiles(checked.accepted);
    setProblems(checked.problems);
    setError(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function uploadFiles(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const batches = toBatches(files);
    const results: UploadSummary[] = [];
    try {
      for (const [index, batch] of batches.entries()) {
        setProgress({ done: index, total: batches.length });
        results.push(await uploadIcons(projectId, batch, { folderId: folderId || null, strategy, optimize, tags: parseTags(tagText) }));
      }
      const merged = mergeSummaries(results);
      setSummary(merged);
      onUploaded(merged);
    } catch (err) {
      // Batches that already went through are kept; say so, so nothing is uploaded twice by accident.
      const done = mergeSummaries(results);
      if (done.created.length + done.replaced.length > 0) {
        setSummary({ ...done, errors: [...done.errors, { file: "The rest of the files", message: err instanceof Error ? err.message : "The upload stopped." }] });
        onUploaded(done);
      } else {
        setError(err instanceof Error ? err.message : "The upload failed.");
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function pasteCodeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pasteCode.trim()) {
      setError("Paste some SVG code first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await pasteIcon(projectId, { rawSvg: pasteCode, name: pasteName.trim() || "Pasted icon", folderId: folderId || null, optimize, tags: parseTags(tagText), strategy });
      if (result.outcome === "skipped") {
        setNotice(result.reason);
      } else {
        onPasted(result);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the icon.");
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    const added = summary.created.length;
    return (
      <div className="space-y-4">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-semibold">{added > 0 ? `Added ${pluralize(added, "icon")}.` : "Nothing new was added."}</p>
            <ul className="mt-1 text-muted-foreground">
              {summary.replaced.length > 0 && <li>{pluralize(summary.replaced.length, "icon")} replaced.</li>}
              {summary.skipped.length > 0 && <li>{pluralize(summary.skipped.length, "icon")} skipped.</li>}
              {summary.foldersCreated > 0 && <li>{pluralize(summary.foldersCreated, "folder")} created from the ZIP.</li>}
              {summary.errors.length > 0 && <li>{pluralize(summary.errors.length, "file")} could not be added.</li>}
            </ul>
          </div>
        </div>
        {summary.errors.length > 0 && (
          <section aria-label="Files that could not be added">
            <h3 className="text-sm font-semibold">Could not be added</h3>
            <ul className="mt-1 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {summary.errors.map((item, index) => (
                <li key={`${item.file}-${index}`} className="px-3 py-2">
                  <span className="font-medium">{item.file}</span>
                  <span className="block text-muted-foreground">{item.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {summary.skipped.length > 0 && (
          <section aria-label="Skipped icons">
            <h3 className="text-sm font-semibold">Skipped</h3>
            <ul className="mt-1 max-h-32 overflow-y-auto text-sm text-muted-foreground">
              {summary.skipped.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {item.name}: {item.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const options = (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <SelectField label="Folder" value={folderId} onChange={(event) => setFolderId(event.target.value)} hint={tab === "files" ? "A ZIP's folders are created inside it." : undefined}>
        <option value="">Uncategorized (project root)</option>
        {folderOptions.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {`${"  ".repeat(folder.depth)}${folder.name}`}
          </option>
        ))}
      </SelectField>
      <SelectField label="If an icon with that name exists" value={strategy} onChange={(event) => setStrategy(event.target.value as DuplicateStrategy)}>
        <option value="rename">Keep both (add a number)</option>
        <option value="replace">Replace it (the old one is kept as a version)</option>
        <option value="skip">Skip</option>
      </SelectField>
      <TextField label="Tags" value={tagText} autoComplete="off" hint="Optional, separated by commas." onChange={(event) => setTagText(event.target.value)} />
      <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" checked={optimize} onChange={(event) => setOptimize(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
        Optimize to make the files smaller
      </label>
    </div>
  );

  const errorMessage = error && (
    <p role="alert" className="mt-3 text-sm font-medium text-destructive">
      {error}
    </p>
  );

  return (
    <Tabs
      label="How to add icons"
      value={tab}
      onChange={(next) => {
        setTab(next);
        setError(null);
        setNotice(null);
      }}
      tabs={[
        { value: "files", label: "Upload files" },
        { value: "paste", label: "Paste SVG code" },
      ]}
    >
      {tab === "files" ? (
        <form onSubmit={uploadFiles}>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input p-6 text-center", dragging && "border-primary bg-primary/5")}
          >
            <FileUp aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drag SVG files and ZIP archives here</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".svg,.zip,image/svg+xml,application/zip"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose files"
              data-testid="file-input"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <p className="text-xs text-muted-foreground">Up to 25 MB per file. A ZIP can hold up to 500 SVGs.</p>
          </div>

          {problems.length > 0 && (
            <ul aria-label="Files not accepted" className="mt-3 space-y-1 text-sm text-destructive">
              {problems.map((problem, index) => (
                <li key={`${problem.file}-${index}`}>
                  {problem.file}: {problem.message}
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <ul aria-label="Files to add" className="mt-3 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  <IconButton label={`Remove ${file.name}`} className="h-7 w-7" onClick={() => setFiles((current) => current.filter((f) => f !== file))} disabled={busy}>
                    <X aria-hidden="true" className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          {options}
          {errorMessage}
          {progress && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Uploading batch {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </p>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={files.length === 0}>
              {files.length > 0 ? `Add ${pluralize(files.length, "file")}` : "Add files"}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <form onSubmit={pasteCodeSubmit} noValidate>
          <div className="space-y-3">
            <TextField label="Name" value={pasteName} placeholder="Pasted icon" maxLength={100} autoComplete="off" onChange={(event) => setPasteName(event.target.value)} />
            <TextAreaField label="SVG code" value={pasteCode} rows={8} spellCheck={false} className="font-mono text-xs" placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>' onChange={(event) => setPasteCode(event.target.value)} />
          </div>
          {options}
          {notice && (
            <p role="status" className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400">
              {notice}
            </p>
          )}
          {errorMessage}
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Add icon
            </Button>
          </DialogFooter>
        </form>
      )}
    </Tabs>
  );
}

