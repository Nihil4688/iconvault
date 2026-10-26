// Turns the server's flat folder list into a tree and back into an ordered list for menus and indented lists.
import type { FolderItem, FolderWithCount } from "../api/types";

export type FolderNode = FolderWithCount & { children: FolderNode[]; depth: number };

const byOrder = (a: FolderItem, b: FolderItem) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, "en", { sensitivity: "base" });

// A folder whose parent is missing is shown at the top level instead of disappearing.
export function buildFolderTree(folders: FolderWithCount[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((folder) => [folder.id, { ...folder, children: [], depth: 0 }]));
  const roots: FolderNode[] = [];
  for (const folder of [...folders].sort(byOrder)) {
    const node = nodes.get(folder.id) as FolderNode;
    const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const setDepth = (list: FolderNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

// Depth-first order: each folder followed by its subfolders.
export function flattenFolderTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap((node) => [node, ...flattenFolderTree(node.children)]);
}

// "UI / Arrows" for a folder id; "Project root" for null or an unknown id.
export function folderPath(folders: FolderItem[], id: string | null): string {
  if (!id) return "Project root";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let current = byId.get(id); current && !seen.has(current.id); current = current.parentId ? byId.get(current.parentId) : undefined) {
    seen.add(current.id);
    parts.unshift(current.name);
  }
  return parts.length > 0 ? parts.join(" / ") : "Project root";
}

// The folder's own icons plus those of every subfolder.
export function totalIconCount(node: FolderNode): number {
  return node.iconCount + node.children.reduce((sum, child) => sum + totalIconCount(child), 0);
}

// Every folder id below `id` (not including it), for deciding where a folder may be moved.
export function descendantIds(folders: FolderItem[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  }
  const found = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift() as string) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}
