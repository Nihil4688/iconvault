// The Trash section, in the same card layout and width as Project Settings: icons moved to the trash can be restored (one or all) or deleted for good, and the trash can be emptied. Only editors see it; restoring may rename an icon or drop its codepoint when those were taken meanwhile, and says so.
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { batchRestoreIcons, deleteIcon, emptyTrash, listIcons, restoreIcon } from "../../api/icons";
import type { IconItem } from "../../api/types";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/workspaceContext";
import { useResource } from "../../hooks/useResource";
import { formatBytes, formatRelative, pluralize } from "../../lib/format";
import { Button } from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import SvgPreview from "../ui/SvgPreview";

type Pending = { kind: "one"; icon: IconItem } | { kind: "all" } | null;

export default function TrashTab() {
  const { project, refreshProject, refreshFolders, refreshIcons } = useWorkspace();
  const { showToast } = useToast();
  const canEdit = project.access.canEdit;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const trash = useResource(`trash:${project.id}:${canEdit}:${version}`, () => (canEdit ? listIcons(project.id, { trash: true, sort: "newest", limit: 1000 }) : Promise.resolve({ icons: [], total: 0, page: 1, limit: 1000 })));
  const icons = trash.data?.icons ?? [];

  const refreshAll = () => {
    setVersion((v) => v + 1);
    refreshIcons();
    refreshFolders();
    refreshProject();
  };

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      showToast(err instanceof Error ? err.message : failure, "error");
    } finally {
      setBusy(false);
    }
  }

  const restoreOne = (icon: IconItem) =>
    run(async () => {
      const { adjusted } = await restoreIcon(icon.id);
      refreshAll();
      showToast(adjusted.length > 0 ? `Restored “${icon.name}”. ${adjusted.join(" ")}` : `Restored “${icon.name}”.`, adjusted.length > 0 ? "warning" : "success");
    }, "Could not restore the icon.");

  const restoreAll = () =>
    run(async () => {
      const result = await batchRestoreIcons(project.id, icons.map((icon) => icon.id));
      refreshAll();
      const changed = result.adjusted.length;
      showToast(changed > 0 ? `Restored ${pluralize(result.matched, "icon")}; ${pluralize(changed, "icon")} needed a new id or lost a codepoint.` : `Restored ${pluralize(result.matched, "icon")}.`, changed > 0 ? "warning" : "success");
    }, "Could not restore the icons.");

  if (!canEdit) {
    return <p className="mx-auto max-w-5xl rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Only the owner can see this project’s trash.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <section aria-labelledby="trash-heading" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 id="trash-heading" className="text-lg font-bold">
        Trash
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Icons in the trash are hidden from the project but can be brought back until you delete them for good.</p>

      {trash.error && !trash.data ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-6 text-center">
          <p className="font-medium text-destructive">{trash.error.message}</p>
          <Button className="mt-3" onClick={trash.reload}>
            Try again
          </Button>
        </div>
      ) : trash.loading && !trash.data ? (
        <ul aria-busy="true" aria-label="Loading trash" className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </ul>
      ) : icons.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center">
          <Trash2 aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-base font-semibold">The trash is empty.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm font-medium">
              {pluralize(trash.data?.total ?? icons.length, "icon")} in the trash
            </p>
            <div className="flex gap-2">
              <Button icon={<RotateCcw aria-hidden="true" className="h-4 w-4" />} onClick={restoreAll} disabled={busy}>
                Restore all
              </Button>
              <Button variant="destructive" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => setPending({ kind: "all" })} disabled={busy}>
                Empty trash
              </Button>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {icons.map((icon) => (
              <li key={icon.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <SvgPreview svg={icon.svg ?? ""} size={24} />
                </span>
                <span className="min-w-40 flex-1">
                  <span className="block truncate text-sm font-medium">{icon.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatBytes(icon.byteSize)}
                    {icon.deletedAt ? ` · deleted ${formatRelative(icon.deletedAt)}` : ""}
                  </span>
                </span>
                <Button size="sm" onClick={() => restoreOne(icon)} disabled={busy} aria-label={`Restore ${icon.name}`}>
                  Restore
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setPending({ kind: "one", icon })} disabled={busy} aria-label={`Delete forever: ${icon.name}`}>
                  Delete forever
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "one" ? `Delete “${pending.icon.name}” forever?` : "Empty the trash?"}
        message={pending?.kind === "one" ? "This icon and its saved versions will be removed for good. This cannot be undone." : `This permanently deletes ${pluralize(trash.data?.total ?? icons.length, "icon")} and their saved versions. This cannot be undone.`}
        confirmLabel={pending?.kind === "one" ? "Delete forever" : "Empty trash"}
        destructive
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          if (pending.kind === "one") {
            await deleteIcon(pending.icon.id, { permanent: true });
            showToast(`Deleted “${pending.icon.name}” for good.`, "success");
          } else {
            const { deleted } = await emptyTrash(project.id);
            showToast(`Deleted ${pluralize(deleted, "icon")} for good.`, "success");
          }
          setVersion((v) => v + 1);
          refreshProject();
        }}
      />
    </div>
  );
}
