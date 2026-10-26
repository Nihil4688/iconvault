// The folder list beside a project's icons: All icons, Uncategorized (which has its own menu: rename, reset the name, move everything to the trash), and the nested folders with counts. Folders can be created, renamed, moved and deleted from a menu (for people who can edit), and accept icons dropped on them. Dragging is optional: moving also works from the bulk actions bar.
import { ChevronDown, ChevronRight, Folder, FolderInput, FolderPlus, Inbox, Layers, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FolderWithCount } from "../../api/types";
import type { FolderSelection } from "../../context/workspaceContext";
import { cn } from "../../lib/cn";
import { getDraggedIcons, hasDraggedIcons } from "../../lib/dragIcons";
import { buildFolderTree, totalIconCount, type FolderNode } from "../../lib/folderTree";
import ActionMenu, { type MenuAction } from "../ui/ActionMenu";
import { IconButton } from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { FolderNameDialog, MoveFolderDialog } from "./FolderDialogs";

type FolderTreeProps = {
  folders: FolderWithCount[];
  uncategorizedCount: number;
  // What the icons in no folder are called here; empty means "Uncategorized".
  uncategorizedName?: string;
  // Only the owner (or an admin) may rename the group.
  canManage?: boolean;
  onRenameUncategorized?: (name: string) => Promise<void>;
  onTrashUncategorized?: () => Promise<void>;
  totalCount: number;
  selected: FolderSelection;
  onSelect: (selection: FolderSelection) => void;
  canEdit: boolean;
  onCreate: (parentId: string | null, name: string) => Promise<void>;
  onRename: (folder: FolderWithCount, name: string) => Promise<void>;
  onMove: (folder: FolderWithCount, parentId: string | null) => Promise<void>;
  onDelete: (folder: FolderWithCount) => Promise<void>;
  onDropIcons: (folderId: string | null, iconIds: string[]) => void;
};

type DialogState =
  | { kind: "create"; parent: FolderWithCount | null }
  | { kind: "rename"; folder: FolderWithCount }
  | { kind: "move"; folder: FolderWithCount }
  | { kind: "delete"; folder: FolderWithCount }
  | { kind: "renameLoose" }
  | { kind: "trashLoose" }
  | null;

const rowBase = "group flex items-center gap-1 rounded-lg pr-1 transition-colors";
const buttonBase = "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

export default function FolderTree({ folders, uncategorizedCount, uncategorizedName = "", canManage = false, onRenameUncategorized, onTrashUncategorized, totalCount, selected, onSelect, canEdit, onCreate, onRename, onMove, onDelete, onDropIcons }: FolderTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const tree = buildFolderTree(folders);

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dropHandlers(key: string, folderId: string | null) {
    if (!canEdit) return {};
    return {
      onDragOver: (event: React.DragEvent) => {
        if (!hasDraggedIcons(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
      onDrop: (event: React.DragEvent) => {
        setDropTarget(null);
        const ids = getDraggedIcons(event.dataTransfer);
        if (ids.length === 0) return;
        event.preventDefault();
        onDropIcons(folderId, ids);
      },
    };
  }

  function renderNode(node: FolderNode) {
    const isSelected = selected === node.id;
    const hasChildren = node.children.length > 0;
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id}>
        <div className={cn(rowBase, isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/60", dropTarget === node.id && "bg-primary/10 ring-2 ring-primary")} style={{ paddingLeft: `${node.depth * 14 + 4}px` }} {...dropHandlers(node.id, node.id)}>
          {hasChildren ? (
            <button type="button" onClick={() => toggle(node.id)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          <button type="button" onClick={() => onSelect(node.id)} aria-current={isSelected ? "true" : undefined} className={cn(buttonBase, isSelected ? "font-semibold" : "text-foreground")}>
            <Folder aria-hidden="true" className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
            <span className="truncate">{node.name}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{totalIconCount(node)}</span>
          </button>
          {canEdit && (
            <ActionMenu
              label={`Actions for folder ${node.name}`}
              actions={[
                { label: "New subfolder", icon: <FolderPlus aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "create", parent: node }) },
                { label: "Rename", icon: <Pencil aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "rename", folder: node }) },
                { label: "Move to…", icon: <FolderInput aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "move", folder: node }) },
                { label: "Delete", icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "delete", folder: node }), destructive: true },
              ]}
            />
          )}
        </div>
        {hasChildren && open && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  }

  const looseLabel = uncategorizedName || "Uncategorized";
  const looseActions: MenuAction[] = [];
  if (canManage && onRenameUncategorized) {
    looseActions.push({ label: "Rename", icon: <Pencil aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "renameLoose" }) });
    if (uncategorizedName) looseActions.push({ label: "Reset name", icon: <RotateCcw aria-hidden="true" className="h-4 w-4" />, onSelect: () => void onRenameUncategorized("") });
  }
  if (canEdit && onTrashUncategorized) {
    looseActions.push({ label: "Move all to trash", icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => setDialog({ kind: "trashLoose" }), destructive: true, disabled: uncategorizedCount === 0 });
  }
  const allSelected = selected === "all";
  const rootSelected = selected === "root";

  return (
    <nav aria-label="Folders">
      <div className="mb-1 flex items-center justify-between pl-3 pr-1 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Folders</h2>
        {canEdit && (
          <IconButton label="New folder" className="h-7 w-7" onClick={() => setDialog({ kind: "create", parent: null })}>
            <Plus aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      <ul>
        <li>
          <div className={cn(rowBase, allSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/60")} style={{ paddingLeft: 4 }}>
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
            <button type="button" onClick={() => onSelect("all")} aria-current={allSelected ? "true" : undefined} className={cn(buttonBase, allSelected && "font-semibold")}>
              <Layers aria-hidden="true" className={cn("h-4 w-4 shrink-0", allSelected ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">All icons</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{totalCount}</span>
            </button>
          </div>
        </li>
        <li>
          <div className={cn(rowBase, rootSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/60", dropTarget === "root" && "bg-primary/10 ring-2 ring-primary")} style={{ paddingLeft: 4 }} {...dropHandlers("root", null)}>
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
            <button type="button" onClick={() => onSelect("root")} aria-current={rootSelected ? "true" : undefined} className={cn(buttonBase, rootSelected && "font-semibold")}>
              <Inbox aria-hidden="true" className={cn("h-4 w-4 shrink-0", rootSelected ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">{looseLabel}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{uncategorizedCount}</span>
            </button>
            {looseActions.length > 0 && <ActionMenu label={`Actions for ${looseLabel}`} actions={looseActions} />}
          </div>
        </li>
        {tree.map(renderNode)}
      </ul>

      <FolderNameDialog
        open={dialog?.kind === "create"}
        title={dialog?.kind === "create" && dialog.parent ? `New subfolder in “${dialog.parent.name}”` : "New folder"}
        submitLabel="Create folder"
        onClose={() => setDialog(null)}
        onSubmit={(name) => onCreate(dialog?.kind === "create" ? (dialog.parent?.id ?? null) : null, name)}
      />
      <FolderNameDialog
        open={dialog?.kind === "rename"}
        title="Rename folder"
        submitLabel="Rename"
        initialName={dialog?.kind === "rename" ? dialog.folder.name : ""}
        onClose={() => setDialog(null)}
        onSubmit={(name) => (dialog?.kind === "rename" ? onRename(dialog.folder, name) : Promise.resolve())}
      />
      <FolderNameDialog
        open={dialog?.kind === "renameLoose"}
        title={`Rename “${looseLabel}”`}
        submitLabel="Rename"
        initialName={uncategorizedName}
        onClose={() => setDialog(null)}
        onSubmit={(name) => (onRenameUncategorized ? onRenameUncategorized(name.slice(0, 40)) : Promise.resolve())}
      />
      <ConfirmDialog
        open={dialog?.kind === "trashLoose"}
        title={`Move all ${uncategorizedCount === 1 ? "1 icon" : `${uncategorizedCount} icons`} in “${looseLabel}” to the trash?`}
        message="Icons in folders are not touched. You can restore these from the Trash section."
        confirmLabel="Move to trash"
        destructive
        onClose={() => setDialog(null)}
        onConfirm={() => (onTrashUncategorized ? onTrashUncategorized() : undefined)}
      />
      <MoveFolderDialog open={dialog?.kind === "move"} folder={dialog?.kind === "move" ? dialog.folder : null} folders={folders} onClose={() => setDialog(null)} onSubmit={(parentId) => (dialog?.kind === "move" ? onMove(dialog.folder, parentId) : Promise.resolve())} />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={`Delete folder “${dialog?.kind === "delete" ? dialog.folder.name : ""}”?`}
        message="Its subfolders are deleted too. The icons inside are not deleted: they move to Uncategorized."
        confirmLabel="Delete folder"
        destructive
        onClose={() => setDialog(null)}
        onConfirm={() => (dialog?.kind === "delete" ? onDelete(dialog.folder) : undefined)}
      />
    </nav>
  );
}
