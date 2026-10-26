// A project's workspace: header with section links, then the Icons, Trash or Settings section. On the Icons section the folder tree sits beside the content (collapsible on small screens). Loads the project and its folders and shares them, with the selected folder and refresh functions, through the workspace context.
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/http";
import { createFolder, deleteFolder, listFolders, moveFolder, renameFolder } from "../api/folders";
import { batchMoveIcons, batchRestoreIcons, trashUncategorizedIcons } from "../api/icons";
import { getProject, updateProject } from "../api/projects";
import type { FolderList } from "../api/types";
import { Button } from "../components/ui/Button";
import FolderTree from "../components/workspace/FolderTree";
import IconsTab from "../components/workspace/IconsTab";
import ProjectHeader from "../components/workspace/ProjectHeader";
import FontTab from "../components/workspace/FontTab";
import SpriteTab from "../components/workspace/SpriteTab";
import SettingsTab from "../components/workspace/SettingsTab";
import TrashTab from "../components/workspace/TrashTab";
import { WorkspaceContext, type FolderSelection, type WorkspaceContextValue } from "../context/workspaceContext";
import { useToast } from "../context/ToastContext";
import { useResource } from "../hooks/useResource";
import { folderPath } from "../lib/folderTree";
import { pluralize } from "../lib/format";

const NO_FOLDERS: FolderList = { folders: [], uncategorizedCount: 0 };

export default function ProjectPage() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { showToast } = useToast();

  const loadedProject = useResource(`project:${projectId}`, () => getProject(projectId));
  // Moving straight from one project to another keeps the previous project's data around until the new one arrives. Only data that belongs to the address is trusted, so the old project can never decide what the new one shows (for example which section it redirects to).
  const project = { ...loadedProject, data: loadedProject.data?.id === projectId ? loadedProject.data : undefined };
  const loadedFolders = useResource(`folders:${projectId}`, async () => ({ projectId, list: await listFolders(projectId) }));
  const folders = { ...loadedFolders, data: loadedFolders.data?.projectId === projectId ? loadedFolders.data.list : undefined };
  const [iconsVersion, setIconsVersion] = useState(0);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  const folderList = folders.data ?? NO_FOLDERS;
  const requested = params.get("folder");
  const selectedFolder: FolderSelection = requested === "root" ? "root" : requested && folderList.folders.some((f) => f.id === requested) ? requested : "all";
  const onIconsSection = /^\/projects\/[^/]+\/?$/.test(location.pathname);

  function selectFolder(selection: FolderSelection) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (selection === "all") next.delete("folder");
        else next.set("folder", selection);
        return next;
      },
      { replace: false },
    );
    setFoldersOpen(false);
  }

  if (project.error && !project.data) {
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(57px+3rem)] text-center outline-none">
        <div role="alert" className="rounded-2xl border border-border bg-card p-8">
          <h1 className="text-xl font-semibold">{missing ? "Project not found" : "Could not load the project"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{missing ? "It may have been deleted, or it is private and belongs to someone else." : project.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            {!missing && <Button onClick={project.reload}>Try again</Button>}
            <Link to="/" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Back to projects
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!project.data) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-[calc(57px+2rem)] outline-none">
        <div role="status" aria-busy="true" aria-label="Loading project" className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }


  const context: WorkspaceContextValue = {
    project: project.data,
    folderList,
    selectedFolder,
    selectFolder,
    refreshProject: project.reload,
    refreshFolders: folders.reload,
    iconsVersion,
    refreshIcons: () => setIconsVersion((value) => value + 1),
    actionsSlot,
  };

  return (
    <WorkspaceContext.Provider value={context}>
      <main id="main" tabIndex={-1} className="flex min-h-screen flex-col pt-[57px] outline-none">
        <ProjectHeader project={project.data} actionsRef={setActionsSlot} />

        <div className="flex flex-1 flex-col">
          {onIconsSection ? (
            // Split view: the folders on the left, the icons on the right, divided by a line, using the whole width.
            <div className="grid flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
              <aside aria-label="Folders" className="border-b border-border p-3 lg:border-b-0 lg:border-r lg:p-4">
                <button
                  type="button"
                  aria-expanded={foldersOpen}
                  aria-controls="folder-panel"
                  onClick={() => setFoldersOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:hidden"
                >
                  <span>Folder: {selectedFolder === "all" ? "All icons" : selectedFolder === "root" ? project.data.uncategorizedName || "Uncategorized" : folderPath(folderList.folders, selectedFolder)}</span>
                  {foldersOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
                </button>
                <div id="folder-panel" className={`${foldersOpen ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}>
                  {folders.error && !folders.data && (
                    <p role="alert" className="mb-2 text-sm text-destructive">
                      Could not load folders. <button type="button" className="underline" onClick={folders.reload}>Try again</button>
                    </p>
                  )}
                  <FolderTree
                    folders={folderList.folders}
                    uncategorizedCount={folderList.uncategorizedCount}
                    uncategorizedName={project.data.uncategorizedName}
                    canManage={project.data.access.canManage}
                    onRenameUncategorized={async (name) => {
                      await updateProject(projectId, { uncategorizedName: name });
                      project.reload();
                    }}
                    onTrashUncategorized={async () => {
                      const result = await trashUncategorizedIcons(projectId);
                      folders.reload();
                      project.reload();
                      setIconsVersion((value) => value + 1);
                      showToast(`Moved ${pluralize(result.matched, "icon")} to the trash.`, "success", [
                        {
                          label: "Undo",
                          type: "primary",
                          onClick: () => {
                            batchRestoreIcons(projectId, result.ids).then(
                              () => {
                                folders.reload();
                                project.reload();
                                setIconsVersion((value) => value + 1);
                              },
                              (err: unknown) => showToast(err instanceof Error ? err.message : "Could not restore the icons.", "error"),
                            );
                          },
                        },
                      ]);
                    }}
                    totalCount={project.data.iconCount}
                    selected={selectedFolder}
                    onSelect={selectFolder}
                    canEdit={project.data.access.canEdit}
                    // A failure is thrown to the dialog, which shows it; only successes are announced here.
                    onCreate={async (parentId, name) => {
                      await createFolder(projectId, { name, parentId });
                      folders.reload();
                      showToast(`Created folder “${name}”.`, "success");
                    }}
                    onRename={async (folder, name) => {
                      await renameFolder(folder.id, name);
                      folders.reload();
                    }}
                    onMove={async (folder, parentId) => {
                      await moveFolder(folder.id, { parentId });
                      folders.reload();
                    }}
                    onDelete={async (folder) => {
                      const result = await deleteFolder(folder.id);
                      if (selectedFolder === folder.id) selectFolder("all");
                      folders.reload();
                      project.reload();
                      setIconsVersion((value) => value + 1);
                      showToast(result.movedIcons > 0 ? `Deleted “${folder.name}”. ${pluralize(result.movedIcons, "icon")} moved to Uncategorized.` : `Deleted “${folder.name}”.`, "success");
                    }}
                    onDropIcons={(folderId, iconIds) => {
                      batchMoveIcons(projectId, iconIds, folderId).then(
                        (result) => {
                          folders.reload();
                          setIconsVersion((value) => value + 1);
                          showToast(`Moved ${pluralize(result.matched, "icon")}.`, "success");
                        },
                        (err: unknown) => showToast(err instanceof Error ? err.message : "Could not move the icons.", "error"),
                      );
                    }}
                  />
                </div>
              </aside>
              <div className="min-w-0">
                <IconsTab key={projectId} />
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <Routes>
              {/* A project is a sprite project or a font project, chosen at creation: each has only its own section. */}
              <Route path="sprite" element={project.data.purpose === "sprite" ? <SpriteTab /> : <Navigate to={`/projects/${projectId}`} replace />} />
              <Route path="font" element={project.data.purpose === "font" ? <FontTab key={projectId} /> : <Navigate to={`/projects/${projectId}`} replace />} />
              <Route path="trash" element={<TrashTab />} />
              <Route path="settings" element={<SettingsTab />} />
              <Route path="*" element={<Navigate to={`/projects/${projectId}`} replace />} />
            </Routes>
            </div>
          )}
        </div>
      </main>
    </WorkspaceContext.Provider>
  );
}
