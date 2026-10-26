// Projects API: list, create, read, update, delete, duplicate, export and import. All calls need a signed-in user.
import { http } from "./http";
import { filenameFromDisposition } from "./icons";
import type { CreateProjectInput, DownloadedFile, ListProjectsParams, ProjectDetail, ProjectImportResult, ProjectList, UpdateProjectInput } from "./types";

export async function listProjects(params: ListProjectsParams = {}): Promise<ProjectList> {
  const { data } = await http.get<ProjectList>("/api/projects", { params });
  return data;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDetail> {
  const { data } = await http.post<ProjectDetail>("/api/projects", input);
  return data;
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { data } = await http.get<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}`);
  return data;
}

export async function updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail> {
  const { data } = await http.patch<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}`, input);
  return data;
}

// Deletes the project with all its folders, icons and versions.
export async function deleteProject(projectId: string): Promise<{ deletedIcons: number; deletedFolders: number }> {
  const { data } = await http.delete<{ deletedIcons: number; deletedFolders: number }>(`/api/projects/${encodeURIComponent(projectId)}`);
  return data;
}

// Copies a project you can see into a new private project you own.
export async function duplicateProject(projectId: string): Promise<ProjectDetail> {
  const { data } = await http.post<ProjectDetail>(`/api/projects/${encodeURIComponent(projectId)}/duplicate`);
  return data;
}

// The whole project as one ZIP (settings, folders, icons). Hand the result to triggerBrowserDownload (utils/zipBundle.ts).
export async function exportProject(projectId: string): Promise<DownloadedFile> {
  const response = await http.get<Blob>(`/api/projects/${encodeURIComponent(projectId)}/export`, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "project-export.zip") };
}

// Creates a new private project from an export ZIP.
export async function importProject(file: File): Promise<ProjectImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<ProjectImportResult>("/api/projects/import", form);
  return data;
}
