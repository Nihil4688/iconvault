// "Sprite build history": the sprite ZIPs editors downloaded, newest first, each with a version number (the server keeps the last 20 per project). Anyone who can see the project can download one again; editors can delete them.
import { Download, FileArchive, History, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteSpriteBuild, downloadSpriteBuild, listSpriteBuilds } from "../../api/sprites";
import { useToast } from "../../context/ToastContext";
import { useResource } from "../../hooks/useResource";
import { formatBytes, formatDate, pluralize } from "../../lib/format";
import { triggerBrowserDownload } from "../../utils/zipBundle";
import { Button, IconButton } from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";

const MODE_LABELS = { symbol: "Symbol sprite", stack: "Stack sprite", css: "Symbol sprite with CSS" } as const;

type SpriteHistoryProps = {
  projectId: string;
  canEdit: boolean;
  // Changes when a new ZIP was downloaded, so the list is fetched again.
  version: number;
};

export default function SpriteHistory({ projectId, canEdit, version }: SpriteHistoryProps) {
  const { showToast } = useToast();
  const builds = useResource(`sprite-builds:${projectId}:${version}`, () => listSpriteBuilds(projectId));
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; version: number } | null>(null);
  const list = builds.data ?? [];

  async function download(id: string) {
    setBusy(id);
    try {
      const { blob, filename } = await downloadSpriteBuild(projectId, id);
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not download the sprite ZIP.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="sprite-history" className="mt-6 rounded-2xl border border-border p-4">
      <h3 id="sprite-history" className="flex items-center gap-2 text-base font-semibold">
        <History aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        Sprite build history
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">Every sprite ZIP you download is kept here with a version number (the last 20), so you can download it again later.</p>

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
        <p className="mt-3 text-sm text-muted-foreground">{canEdit ? "Nothing yet. Download a sprite ZIP and it will appear here." : "No sprite ZIPs have been kept for this project yet."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((build) => (
            <li key={build.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <FileArchive aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <span className="mr-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{`v${build.version}`}</span>
                  {MODE_LABELS[build.mode]} <span className="font-normal text-muted-foreground">({pluralize(build.iconCount, "symbol")})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(build.createdAt)} · {formatBytes(build.size)}
                </p>
              </div>
              <Button size="sm" icon={<Download aria-hidden="true" className="h-4 w-4" />} loading={busy === build.id} disabled={busy !== null} onClick={() => void download(build.id)} aria-label={`Download sprite v${build.version} from ${formatDate(build.createdAt)}`}>
                Download
              </Button>
              {canEdit && (
                <IconButton label={`Delete sprite v${build.version} from ${formatDate(build.createdAt)}`} onClick={() => setDeleting({ id: build.id, version: build.version })}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete sprite version ${deleting?.version ?? ""}?`}
        message="Only this saved copy is removed. Your icons and any file you already downloaded are not affected."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteSpriteBuild(projectId, deleting.id);
          builds.reload();
          showToast("Deleted the saved sprite.", "success");
        }}
      />
    </section>
  );
}
