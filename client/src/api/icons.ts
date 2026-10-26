// Icons API: upload and paste, list and search, edit, versions, trash, batch actions, copy between projects and downloads.
import { http } from "./http";
import type {
  BatchOptimizeResult,
  BatchResult,
  BatchRestoreResult,
  DownloadedFile,
  DuplicateStrategy,
  IconDetail,
  IconItem,
  IconList,
  IconSearchList,
  IconVersion,
  ListIconsParams,
  OptimizeResult,
  PasteIconInput,
  PasteResult,
  RestoreResult,
  UpdateIconInput,
  UploadOptions,
  UploadSummary,
} from "./types";

const project = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
const icon = (iconId: string) => `/api/icons/${encodeURIComponent(iconId)}`;

export async function listIcons(projectId: string, params: ListIconsParams = {}): Promise<IconList> {
  const { data } = await http.get<IconList>(`${project(projectId)}/icons`, { params });
  return data;
}

// Search across every project you can see.
export async function searchIcons(q: string, params: { page?: number; limit?: number } = {}): Promise<IconSearchList> {
  const { data } = await http.get<IconSearchList>("/api/icons/search", { params: { q, ...params } });
  return data;
}

// Upload SVG files and ZIP archives. A ZIP's folders are recreated under `folderId`.
export async function uploadIcons(projectId: string, files: File[], options: UploadOptions = {}): Promise<UploadSummary> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  form.append("folderId", options.folderId ?? "");
  form.append("strategy", options.strategy ?? "rename");
  form.append("optimize", String(options.optimize ?? true));
  form.append("tags", JSON.stringify(options.tags ?? []));
  const { data } = await http.post<UploadSummary>(`${project(projectId)}/icons/upload`, form);
  return data;
}

export async function pasteIcon(projectId: string, input: PasteIconInput): Promise<PasteResult> {
  const { data } = await http.post<PasteResult>(`${project(projectId)}/icons/paste`, input);
  return data;
}

// Copy icons from a project you can see into this one (which you must be able to edit).
export async function copyIcons(
  projectId: string,
  input: { sourceProjectId: string; iconIds: string[]; folderId?: string | null; strategy?: DuplicateStrategy; optimize?: boolean },
): Promise<UploadSummary> {
  const { data } = await http.post<UploadSummary>(`${project(projectId)}/icons/copy`, input);
  return data;
}

export async function getIcon(iconId: string): Promise<IconDetail> {
  const { data } = await http.get<IconDetail>(icon(iconId));
  return data;
}

export async function updateIcon(iconId: string, input: UpdateIconInput): Promise<IconItem & { svg: string }> {
  const { data } = await http.patch<IconItem & { svg: string }>(icon(iconId), input);
  return data;
}

export async function optimizeIcon(iconId: string): Promise<OptimizeResult> {
  const { data } = await http.post<OptimizeResult>(`${icon(iconId)}/optimize`);
  return data;
}

export async function listVersions(iconId: string): Promise<IconVersion[]> {
  const { data } = await http.get<{ versions: IconVersion[] }>(`${icon(iconId)}/versions`);
  return data.versions;
}

export async function restoreVersion(iconId: string, versionId: string): Promise<IconDetail> {
  const { data } = await http.post<IconDetail>(`${icon(iconId)}/versions/${encodeURIComponent(versionId)}/restore`);
  return data;
}

// Moves the icon to the trash. Pass permanent: true to delete an icon that is already in the trash for good.
export async function deleteIcon(iconId: string, options: { permanent?: boolean } = {}): Promise<unknown> {
  const { data } = await http.delete<unknown>(icon(iconId), { params: options.permanent ? { permanent: true } : undefined });
  return data;
}

export async function restoreIcon(iconId: string): Promise<RestoreResult> {
  const { data } = await http.post<RestoreResult>(`${icon(iconId)}/restore`);
  return data;
}

// Batch actions only ever touch icons of the given project.
export async function batchMoveIcons(projectId: string, iconIds: string[], folderId: string | null): Promise<BatchResult> {
  const { data } = await http.post<BatchResult>(`${project(projectId)}/icons/batch/move`, { iconIds, folderId });
  return data;
}

export async function batchTagIcons(projectId: string, iconIds: string[], tags: string[], mode: "add" | "remove" | "set" = "add"): Promise<BatchResult> {
  const { data } = await http.post<BatchResult>(`${project(projectId)}/icons/batch/tag`, { iconIds, tags, mode });
  return data;
}

export async function batchDeleteIcons(projectId: string, iconIds: string[], options: { permanent?: boolean } = {}): Promise<BatchResult> {
  const { data } = await http.post<BatchResult>(`${project(projectId)}/icons/batch/delete`, { iconIds, permanent: options.permanent ?? false });
  return data;
}

// Sends every icon that is in no folder to the trash; the ids come back so the caller can offer Undo.
export async function trashUncategorizedIcons(projectId: string): Promise<{ ids: string[]; matched: number }> {
  const { data } = await http.post<{ ids: string[]; matched: number }>(`${project(projectId)}/icons/uncategorized/trash`);
  return data;
}

export async function batchRestoreIcons(projectId: string, iconIds: string[]): Promise<BatchRestoreResult> {
  const { data } = await http.post<BatchRestoreResult>(`${project(projectId)}/icons/batch/restore`, { iconIds });
  return data;
}

export async function batchOptimizeIcons(projectId: string, iconIds: string[]): Promise<BatchOptimizeResult> {
  const { data } = await http.post<BatchOptimizeResult>(`${project(projectId)}/icons/batch/optimize`, { iconIds });
  return data;
}

export async function emptyTrash(projectId: string): Promise<{ deleted: number }> {
  const { data } = await http.delete<{ deleted: number }>(`${project(projectId)}/icons/trash`);
  return data;
}

// The file name the server suggests, read from the Content-Disposition header.
export function filenameFromDisposition(header: unknown, fallback: string): string {
  if (typeof header !== "string") return fallback;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? fallback;
}

// One icon downloads as an SVG, several as a ZIP. Hand the result to triggerBrowserDownload (utils/zipBundle.ts).
export async function downloadIcons(projectId: string, iconIds: string[]): Promise<DownloadedFile> {
  const response = await http.post<Blob>(`${project(projectId)}/icons/download`, { iconIds }, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "icons.zip") };
}

export async function downloadIcon(iconId: string): Promise<DownloadedFile> {
  const response = await http.get<Blob>(`${icon(iconId)}/download`, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "icon.svg") };
}
