// Icon fonts API: build a font from a project's icons (preview data), download it as a ZIP, and import the glyphs of an existing font.
import { filenameFromDisposition } from "./icons";
import { http } from "./http";
import type { BuildFontInput, DownloadedFile, FontBuildResult, FontBuildSummary, FontImportOptions, FontImportPreview, FontImportResult } from "./types";

const project = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export async function buildFont(projectId: string, input: BuildFontInput): Promise<FontBuildResult> {
  const { data } = await http.post<FontBuildResult>(`${project(projectId)}/font/build`, input);
  return data;
}

export async function downloadFont(projectId: string, input: BuildFontInput): Promise<DownloadedFile> {
  const response = await http.post<Blob>(`${project(projectId)}/font/download`, input, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "font.zip") };
}

// The font build history: packages editors downloaded earlier, newest first.
export async function listFontBuilds(projectId: string): Promise<FontBuildSummary[]> {
  const { data } = await http.get<{ builds: FontBuildSummary[] }>(`${project(projectId)}/font/builds`);
  return data.builds;
}

export async function downloadFontBuild(projectId: string, buildId: string): Promise<DownloadedFile> {
  const response = await http.get<Blob>(`${project(projectId)}/font/builds/${encodeURIComponent(buildId)}/download`, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "font.zip") };
}

export async function deleteFontBuild(projectId: string, buildId: string): Promise<void> {
  await http.delete(`${project(projectId)}/font/builds/${encodeURIComponent(buildId)}`);
}

// With `dryRun: true` nothing is added and a preview of what the font holds comes back.
export async function importFont(projectId: string, font: File, mapping: File | null, options: FontImportOptions = {}): Promise<FontImportPreview | FontImportResult> {
  const form = new FormData();
  form.append("font", font);
  if (mapping) form.append("mapping", mapping);
  form.append("folderId", options.folderId ?? "");
  form.append("strategy", options.strategy ?? "rename");
  form.append("optimize", String(options.optimize ?? true));
  form.append("privateUseOnly", String(options.privateUseOnly ?? true));
  form.append("dryRun", String(options.dryRun ?? false));
  const { data } = await http.post<FontImportPreview | FontImportResult>(`${project(projectId)}/icons/import-font`, form);
  return data;
}
