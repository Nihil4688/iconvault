// What every screen inside a project needs: the project, its folders, which folder is selected, the selection of icons shared across tabs, and how to refresh. Provided by ProjectPage; read with useWorkspace().
import { createContext, useContext } from "react";
import type { FolderList, ProjectDetail } from "../api/types";
import type { Selection } from "../hooks/useSelection";

// "all" shows every icon, "root" the uncategorized ones, otherwise a folder id.
export type FolderSelection = "all" | "root" | string;

export type WorkspaceContextValue = {
  project: ProjectDetail;
  folderList: FolderList;
  selectedFolder: FolderSelection;
  selectFolder: (selection: FolderSelection) => void;
  // Reload the project (counts, name) and/or the folders after a change.
  refreshProject: () => void;
  refreshFolders: () => void;
  // Changes whenever the icon list should be fetched again (after a move, a folder delete, ...).
  iconsVersion: number;
  refreshIcons: () => void;
  // Where the project header wants its action buttons (Upload icons, From Another Project). Absent outside the project page.
  actionsSlot?: HTMLElement | null;
  // The icons the user has ticked on the Icons screen. Shared across tabs so a selection survives tab navigation, a folder change or a list refresh; only "Clear selection" empties it.
  selection: Selection;
};


export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a project page");
  return ctx;
}
