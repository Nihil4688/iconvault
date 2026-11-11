// Add icons in one dialog: upload SVGs, sprites, ZIPs, METROP projects, and fonts; paste SVG code or copy from another project.
import { CheckCircle2, FileUp, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { importFont } from "../../api/fonts";
import { pasteIcon, uploadIcons } from "../../api/icons";
import type { DuplicateStrategy, FolderWithCount, FontImportPreview, FontImportResult, PasteResult, UploadSummary } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatBytes, pluralize } from "../../lib/format";
import { metropToFiles } from "../../lib/metrop";
import { readFileText } from "../../lib/readFile";
import { spriteToFiles } from "../../lib/spriteBuild";
import { checkFiles, isIconFont, isMetrop, isSvgOrZip, mergeSummaries, parseTags, toBatches } from "../../lib/upload";
import { Button, IconButton } from "../ui/Button";
import Dialog from "../ui/Dialog";
import DialogFooter from "../ui/DialogFooter";
import { TextAreaField, TextField } from "../ui/Fields";
import Tabs from "../ui/Tabs";
import DropdownSelect from "../ui/DropdownSelect";
import { CopyFromProjectForm } from "./CopyFromProjectDialog";
import FolderDropdownSelect from "./FolderDropdownSelect";

type UploadDialogProps = {
  open: boolean;
  projectId: string;
  prefix: string;
  folders: FolderWithCount[];
  // The folder to start with (the one currently open), or null for the project root.
  defaultFolderId: string | null;
  onClose: () => void;
  // Called as soon as something was added, so the lists can refresh behind the dialog.
  onUploaded: (summary: UploadSummary) => void;
  onCopied?: (summary: UploadSummary) => void;
  onPasted: (result: PasteResult) => void;
  // Which tab to show first.
  initialTab?: "files" | "paste" | "copy";
};

export default function UploadDialog({ open, onClose, ...rest }: UploadDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} dismissOnBackdrop={false} autoFocusField={false} title="Add Icons" description="Upload icons, paste SVG code, or copy icons from another project." size="lg" contentLayout="fit">
      <UploadForm onClose={onClose} {...rest} />
    </Dialog>
  );
}

type Tab = "files" | "paste" | "copy";

const duplicateOptions: { value: DuplicateStrategy; label: string }[] = [
  { value: "rename", label: "Keep Both (Add a Number)" },
  { value: "replace", label: "Replace It (the Old One Is Kept as a Version)" },
  { value: "skip", label: "Skip" },
];

function UploadForm({ projectId, prefix, folders, defaultFolderId, onClose, onUploaded, onCopied, onPasted, initialTab = "files" }: Omit<UploadDialogProps, "open">) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [files, setFiles] = useState<File[]>([]);
  const [problems, setProblems] = useState<{ file: string; message: string }[]>([]);
  const [pasteName, setPasteName] = useState("");
  const [pasteCode, setPasteCode] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [strategy, setStrategy] = useState<DuplicateStrategy>("rename");
  const [optimize, setOptimize] = useState(false);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  function isFontImportResult(result: FontImportPreview | FontImportResult): result is FontImportResult {
    return "created" in result;
  }

  function uploadKey(file: File): string {
    const name = file.name.replace(/\.svg$/i, "").replace(/\s+/g, " ").trim().slice(0, 100).trim();
    const key = name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 100)
      .replace(/[-_]+$/g, "");
    return key || "icon";
  }

  async function processFiles(selected: File[]) {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    const results: UploadSummary[] = [];
    try {
      const prepared: { font: File | null; files: File[] }[] = [];
      for (const batch of toBatches(selected, 10)) {
        prepared.push(...await Promise.all(batch.map(async (file) => {
          if (isIconFont(file)) return { font: file, files: [] };
          if (isMetrop(file)) return { font: null, files: metropToFiles(await readFileText(file)) };
          if (isSvgOrZip(file) && /\.svg$/i.test(file.name)) {
            const text = await readFileText(file);
            if (!/<symbol(?:\s|>)/i.test(text)) return { font: null, files: [file] };
            const sprite = spriteToFiles(text, prefix);
            return { font: null, files: sprite?.files ?? [file] };
          }
          return { font: null, files: [file] };
        })));
      }
      const uploadable = prepared.flatMap((item) => item.files);
      const fonts = prepared.flatMap((item) => item.font ? [item.font] : []);

      const batches = toBatches(uploadable);
      const uniqueSvgBatches = fonts.length === 0
        && uploadable.every((file) => /\.svg$/i.test(file.name))
        && new Set(uploadable.map(uploadKey)).size === uploadable.length;
      if (uniqueSvgBatches && batches.length > 1) {
        for (let index = 0; index < batches.length; index += 2) {
          setProgress({ done: index, total: batches.length });
          const group = batches.slice(index, index + 2);
          const settled = await Promise.allSettled(group.map((batch) => uploadIcons(projectId, batch, { folderId: folderId || null, strategy, optimize, tags: parseTags(tagText) })));
          for (const result of settled) {
            if (result.status === "fulfilled") results.push(result.value);
          }
          const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
          if (failure) throw failure.reason;
        }
      } else {
        for (const [index, batch] of batches.entries()) {
          setProgress({ done: index, total: batches.length });
          results.push(await uploadIcons(projectId, batch, { folderId: folderId || null, strategy, optimize, tags: parseTags(tagText) }));
        }
      }
      for (const font of fonts) {
        const imported = await importFont(projectId, font, null, { folderId: folderId || null, strategy, optimize, privateUseOnly: true });
        if (!isFontImportResult(imported)) throw new Error("The font import did not return a result.");
        results.push({
          created: imported.created,
          replaced: imported.replaced,
          skipped: imported.skipped,
          errors: imported.errors,
          foldersCreated: 0,
        });
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

  async function uploadFiles(event: FormEvent) {
    event.preventDefault();
    await processFiles(files);
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
          <section aria-label="Files That Could Not Be Added">
            <h3 className="text-sm font-semibold">Could Not Be Added</h3>
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
          <section aria-label="Skipped Icons">
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
      <div>
        <label htmlFor="upload-folder" className="mb-1.5 block text-sm font-medium text-foreground">Folder</label>
        <FolderDropdownSelect id="upload-folder" value={folderId} folders={folders} onChange={setFolderId} />
        {tab === "files" && <p className="mt-1 text-xs text-muted-foreground">A ZIP's folders are created inside it.</p>}
      </div>
      <div>
        <label htmlFor="upload-strategy" className="mb-1.5 block text-sm font-medium text-foreground">If an Icon with That Name Exists</label>
        <DropdownSelect
          id="upload-strategy"
          label="If an Icon with That Name Exists"
          value={strategy}
          options={duplicateOptions}
          onChange={(value) => setStrategy(value as DuplicateStrategy)}
          showSelectedCheck={false}
          portalMenu
          triggerClassName="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="min-w-0 flex-1 truncate">{duplicateOptions.find((option) => option.value === strategy)?.label}</span>
        </DropdownSelect>
      </div>
      <TextField label="Tags" value={tagText} autoComplete="off" hint="Optional, separated by commas." onChange={(event) => setTagText(event.target.value)} />
      <div className="self-end pb-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={optimize} onChange={(event) => setOptimize(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Optimize to Make the Files Smaller
        </label>
        <p className="mt-1 text-xs text-muted-foreground">Turn on to reduce file size; uploads may take longer.</p>
      </div>
    </div>
  );

  const errorMessage = error && (
    <p role="alert" className="mt-3 text-sm font-medium text-destructive">
      {error}
    </p>
  );

  return (
    <Tabs
      fill
      label="How to Add Icons"
      value={tab}
      onChange={(next) => {
        setTab(next);
        setError(null);
        setNotice(null);
      }}
      tabs={[
        { value: "files", label: "Upload Files" },
        { value: "paste", label: "Paste SVG Code" },
        { value: "copy", label: "From Another Project" },
      ]}
    >
      {tab === "files" && (
        <form onSubmit={uploadFiles}>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn("flex flex-col items-center rounded-xl border-2 border-dashed border-input p-6 text-center", dragging && "border-primary bg-primary/5")}
          >
            <FileUp aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium pt-4 pb-1">Choose files or drag & drop them here</p>
            <p className="text-xs text-muted-foreground pb-4">Supports SVGs, sprites, icon fonts, METROP and ZIP archives, up to 25MB per file</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".svg,.zip,.metrop,.ttf,.otf,.woff,.woff2,image/svg+xml,application/zip,font/*"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose Files"
              data-testid="file-input"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              Choose Files
            </Button>
          </div>

          {problems.length > 0 && (
            <ul aria-label="Files Not Accepted" className="mt-3 space-y-1 text-sm text-destructive">
              {problems.map((problem, index) => (
                <li key={`${problem.file}-${index}`}>
                  {problem.file}: {problem.message}
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <ul aria-label="Files to Add" className="mt-3 max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
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
      )}
      {tab === "paste" && (
        <form onSubmit={pasteCodeSubmit} noValidate>
          <div className="space-y-3">
            <TextField label="Name" value={pasteName}  placeholder="Pasted icon" maxLength={100} autoComplete="off" onChange={(event) => setPasteName(event.target.value)} required />
            <TextAreaField label="SVG Code" value={pasteCode} rows={8} spellCheck={false} required className="font-mono text-xs" placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>' onChange={(event) => setPasteCode(event.target.value)} />
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
              Add Icon
            </Button>
          </DialogFooter>
        </form>
      )}
      {/* Mounted while the dialog is open (even when another tab is active) so its projects and icons load in the background. This way switching to it shows content instead of a loading state, like the other tabs. Hidden rather than unmounted so the fetched data and any selection are kept. */}
      <div hidden={tab !== "copy"}>
        <CopyFromProjectForm
          targetProjectId={projectId}
          targetFolders={folders}
          defaultFolderId={defaultFolderId}
          active={tab === "copy"}
          onClose={onClose}
          onCopied={onCopied ?? onUploaded}
        />
      </div>
    </Tabs>
  );
}
