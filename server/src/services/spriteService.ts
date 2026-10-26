// Builds an SVG sprite from a project's icons on the server, for the command line and scripts (the web app builds sprites in the browser). Each icon becomes one <symbol> with the id `<prefix>-<icon id>`; the root's paint attributes move onto a wrapping <g>, the same shape the web app produces.
import Icon from "../models/Icon.js";
import type { Types } from "mongoose";
import { descendantIds } from "./folderService.js";

type Id = Types.ObjectId;

const IGNORED_ROOT_ATTRIBUTES = new Set(["id", "width", "height", "xmlns", "xmlns:xlink", "version", "class", "viewBox"]);
const ROOT = /^\s*(?:<\?xml[^>]*\?>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i;

export type SpriteBuild = { xml: string; ids: string[]; skipped: string[] };

export function iconToSymbol(svg: string, id: string): string | null {
  const match = ROOT.exec(svg);
  if (!match) return null;
  const attrs = new Map<string, string>();
  for (const attr of (match[1] ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(attr[1] as string, (attr[2] ?? attr[3] ?? "") as string);
  const viewBox = attrs.get("viewBox") ?? `0 0 ${parseFloat(attrs.get("width") ?? "24") || 24} ${parseFloat(attrs.get("height") ?? "24") || 24}`;
  const group = [...attrs].filter(([name]) => !IGNORED_ROOT_ATTRIBUTES.has(name)).map(([name, value]) => ` ${name}="${value.replace(/"/g, "&quot;")}"`).join("");
  return `<symbol id="${id}" viewBox="${viewBox}"><g${group}>${match[2]}</g></symbol>`;
}

// `folderId`: only that folder and its subfolders; "root": only uncategorized icons; null: everything.
export async function buildProjectSprite(projectId: Id, prefix: string, folder: Id | "root" | null): Promise<SpriteBuild> {
  const filter: Record<string, unknown> = { projectId, deletedAt: null };
  if (folder === "root") filter.folderId = null;
  else if (folder) filter.folderId = { $in: [folder, ...[...(await descendantIds(projectId, folder))].map((id) => id)] };
  const icons = await Icon.find(filter).select({ name: 1, slug: 1, svg: 1 }).sort({ slug: 1 }).lean();

  const symbols: { id: string; xml: string }[] = [];
  const skipped: string[] = [];
  for (const icon of icons) {
    const id = `${prefix}-${icon.slug}`;
    const xml = iconToSymbol(icon.svg, id);
    if (xml) symbols.push({ id, xml });
    else skipped.push(icon.name);
  }
  symbols.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = symbols.map((symbol) => symbol.xml).join("\n  ");
  return {
    xml: `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width: 0; height: 0; position: absolute;">\n  <defs>\n  ${body}\n</defs>\n</svg>`,
    ids: symbols.map((symbol) => symbol.id),
    skipped,
  };
}
