// Sprite build history API: send the ZIP the Sprite Builder made (after an editor downloads it), list the kept ZIPs, download one again and delete one.
import { filenameFromDisposition } from "./icons";
import { http } from "./http";
import type { DownloadedFile, SpriteBuildSummary } from "./types";

const project = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export async function uploadSpriteBuild(projectId: string, bundle: Blob, facts: { mode: SpriteBuildSummary["mode"]; iconCount: number }): Promise<SpriteBuildSummary> {
  const form = new FormData();
  form.append("bundle", bundle, "bundle.zip");
  form.append("mode", facts.mode);
  form.append("iconCount", String(facts.iconCount));
  const { data } = await http.post<SpriteBuildSummary>(`${project(projectId)}/sprite/builds`, form);
  return data;
}

export async function listSpriteBuilds(projectId: string): Promise<SpriteBuildSummary[]> {
  const { data } = await http.get<{ builds: SpriteBuildSummary[] }>(`${project(projectId)}/sprite/builds`);
  return data.builds;
}

export async function downloadSpriteBuild(projectId: string, buildId: string): Promise<DownloadedFile> {
  const response = await http.get<Blob>(`${project(projectId)}/sprite/builds/${encodeURIComponent(buildId)}/download`, { responseType: "blob" });
  return { blob: response.data, filename: filenameFromDisposition(response.headers["content-disposition"], "sprite.zip") };
}

export async function deleteSpriteBuild(projectId: string, buildId: string): Promise<void> {
  await http.delete(`${project(projectId)}/sprite/builds/${encodeURIComponent(buildId)}`);
}
