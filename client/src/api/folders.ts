// Folders API. Folders nest inside a project; a null parent means the project root.
import { http } from "./http";
import type { FolderItem, FolderList } from "./types";

export async function listFolders(projectId: string): Promise<FolderList> {
  const { data } = await http.get<FolderList>(`/api/projects/${encodeURIComponent(projectId)}/folders`);
  return data;
}

export async function createFolder(projectId: string, input: { name: string; parentId?: string | null }): Promise<FolderItem> {
  const { data } = await http.post<FolderItem>(`/api/projects/${encodeURIComponent(projectId)}/folders`, input);
  return data;
}

export async function renameFolder(folderId: string, name: string): Promise<FolderItem> {
  const { data } = await http.patch<FolderItem>(`/api/folders/${encodeURIComponent(folderId)}`, { name });
  return data;
}

// Never into the folder itself or one of its subfolders; the server refuses with 400.
export async function moveFolder(folderId: string, input: { parentId: string | null; orderIndex?: number }): Promise<FolderItem> {
  const { data } = await http.post<FolderItem>(`/api/folders/${encodeURIComponent(folderId)}/move`, input);
  return data;
}

// Deletes the folder and its subfolders; the icons inside move to the project root.
export async function deleteFolder(folderId: string): Promise<{ deletedFolders: number; movedIcons: number }> {
  const { data } = await http.delete<{ deletedFolders: number; movedIcons: number }>(`/api/folders/${encodeURIComponent(folderId)}`);
  return data;
}
