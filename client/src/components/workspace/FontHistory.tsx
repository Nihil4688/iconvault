// "Font build history": the packages editors downloaded earlier, newest first (the server keeps the last 20 per project). Anyone who can see the project can download one again; editors can delete them.
import { Download, FileArchive, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteFontBuild, downloadFontBuild, listFontBuilds } from "../../api/fonts";
import { useToast } from "../../context/ToastContext";
import { useResource } from "../../hooks/useResource";
import { formatBytes, formatDate, pluralize } from "../../lib/format";
import { triggerBrowserDownload } from "../../utils/zipBundle";
import { Button, IconButton } from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";

type FontHistoryProps = {
  projectId: string;
  canEdit: boolean;
  // Changes when a new package was downloaded, so the list is fetched again.
  version: number;
};

export default function FontHistory({ projectId, canEdit, version }: FontHistoryProps) {
  const { showToast } = useToast();
  const builds = useResource(`font-builds:${projectId}:${version}`, () => listFontBuilds(projectId));
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; fontName: string; version: number } | null>(null);
  const list = builds.data ?? [];

  async function download(id: string) {
    setBusy(id);
    try {
      const { blob, filename } = await downloadFontBuild(projectId, id);
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not download the package.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="font-history" className="mt-6 rounded-2xl border border-border p-4">
      <h3 id="font-history" className="flex items-center gap-2 text-base font-semibold">
        <History aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        Font build history
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">Every package you download is kept here with a version number (the last 20), so you can download it again later.</p>

      {builds.error && !builds.data ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {builds.error.message}{" "}
          <button type="button" className="underline" onClick={builds.reload}>
            Try again
          </button>
        </p>
      ) : builds.loading && !builds.data ? (
        <p role="status" aria-busy="true" className="mt-3 text-sm text-muted-foreground">
          Loading the history…
        </p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{canEdit ? "Nothing yet. Download a font and it will appear here." : "No packages have been kept for this project yet."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((build) => (
            <li key={build.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <FileArchive aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <span className="mr-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{`v${build.version}`}</span>
                  {build.fontName} <span className="font-normal text-muted-foreground">({pluralize(build.iconCount, "glyph")})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(build.createdAt)} · {formatBytes(build.size)} · {build.formats.map((format) => format.toUpperCase()).join(", ")}
                </p>
              </div>
              <Button size="sm" icon={<Download aria-hidden="true" className="h-4 w-4" />} loading={busy === build.id} disabled={busy !== null} onClick={() => void download(build.id)} aria-label={`Download ${build.fontName} v${build.version} from ${formatDate(build.createdAt)}`}>
                Download
              </Button>
              {canEdit && (
                <IconButton label={`Delete ${build.fontName} v${build.version} from ${formatDate(build.createdAt)}`} onClick={() => setDeleting({ id: build.id, fontName: build.fontName, version: build.version })}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete version ${deleting?.version ?? ""} of “${deleting?.fontName ?? ""}”?`}
        message="Only this saved copy is removed. Your icons and any file you already downloaded are not affected."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteFontBuild(projectId, deleting.id);
          builds.reload();
          showToast("Deleted the saved package.", "success");
        }}
      />
    </section>
  );
}
