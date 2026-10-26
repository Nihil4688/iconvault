// The bar that appears when icons are selected: how many, and what can be done to them. Build (a sprite or a font, depending on the project) and Download are for everyone; Move, Tag, Optimize and Delete only for people who can edit the project.
import { Download, FolderInput, Hammer, Sparkles, Tag, Trash2, X } from "lucide-react";
import { pluralize } from "../../lib/format";
import { Button } from "../ui/Button";

type BulkBarProps = {
  count: number;
  canEdit: boolean;
  busy: boolean;
  onMove: () => void;
  onTag: () => void;
  onOptimize: () => void;
  // What the Build button makes, and what it does: for a font it builds from the selection and opens the Font page; for a sprite it opens the Sprite page.
  generate: "sprite" | "font";
  // True while the font is being built.
  generating?: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
};

export default function BulkBar({ count, canEdit, busy, generate, generating = false, onMove, onTag, onOptimize, onGenerate, onDownload, onDelete, onClear }: BulkBarProps) {
  return (
    <section aria-label="Selected icons" className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
      <p role="status" className="px-2 text-sm font-medium">
        {pluralize(count, "icon")} selected
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {canEdit && (
          <>
            <Button size="sm" disabled={busy} icon={<FolderInput aria-hidden="true" className="h-4 w-4" />} onClick={onMove}>
              Move
            </Button>
            <Button size="sm" disabled={busy} icon={<Tag aria-hidden="true" className="h-4 w-4" />} onClick={onTag}>
              Tag
            </Button>
            <Button size="sm" disabled={busy} icon={<Sparkles aria-hidden="true" className="h-4 w-4" />} onClick={onOptimize}>
              Optimize
            </Button>
          </>
        )}
        <Button size="sm" variant="primary" disabled={busy} loading={generating} icon={<Hammer aria-hidden="true" className="h-4 w-4" />} onClick={onGenerate}>
          {generate === "font" ? "Build font" : "Build sprite"}
        </Button>
        <Button size="sm" disabled={busy} icon={<Download aria-hidden="true" className="h-4 w-4" />} onClick={onDownload}>
          Download
        </Button>
        {canEdit && (
          <Button size="sm" variant="destructive" disabled={busy} icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
      <Button size="sm" variant="ghost" className="ml-auto" icon={<X aria-hidden="true" className="h-4 w-4" />} onClick={onClear}>
        Clear selection
      </Button>
    </section>
  );
}
