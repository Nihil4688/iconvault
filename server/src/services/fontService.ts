// Building an icon font from a project's icons. Font Builder codepoint edits are sent with each build and are never saved to icons. The fonts, CSS, SCSS and glyph map come from `fantasticon`; ZIP packaging uses fflate and builds its own specimen page.
import { zipSync } from "fflate";
import { FontAssetType, OtherAssetType, generateFonts } from "fantasticon";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isFontCodepoint } from "../lib/codepoint.js";
import { BadRequestError, ConflictError } from "../lib/errors.js";
import type { BuildFontInput } from "../lib/validation.js";
import Icon from "../models/Icon.js";
import Project from "../models/Project.js";
import mongoose, { type Types } from "mongoose";
import { descendantIds } from "./folderService.js";

type Id = Types.ObjectId;

export const MAX_FONT_ICONS = 1000;
// The basic-plane Private Use Area: 6400 characters.
const PUA_START = 0xe000;
const PUA_END = 0xf8ff;

export type FontIcon = { id: string; name: string; slug: string; svg: string; codepoint: string | null; hasStroke: boolean; hasGradient: boolean; hasText: boolean };

export type CodepointPlan = {
  // Every icon id mapped to its codepoint number.
  all: Map<string, number>;
  // The icons that did not have one and got a new one.
  assigned: Map<string, number>;
};

export const toHex = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");

// Pure: keeps existing codepoints, and gives the others the next free character from `startHex`, wrapping around the Private Use Area. `usedElsewhere` holds codepoints of icons that are not in this build but share the project (they must not be reused).
export function planCodepoints(icons: Pick<FontIcon, "id" | "codepoint">[], startHex: string, usedElsewhere: Iterable<number> = [], reassignExisting = false, nextAfter?: number): CodepointPlan {
  const used = new Set<number>(usedElsewhere);
  const all = new Map<string, number>();
  if (!reassignExisting) {
    for (const icon of icons) {
      if (icon.codepoint) {
        const n = parseInt(icon.codepoint, 16);
        all.set(icon.id, n);
        used.add(n);
      }
    }
  }
  const assigned = new Map<string, number>();
  let cursor = Math.min(Math.max(parseInt(startHex, 16) || PUA_START, PUA_START), PUA_END);
  if (!reassignExisting && nextAfter !== undefined) cursor = Math.max(cursor, nextAfter + 1);
  const first = cursor;
  let wrapped = false;
  for (const icon of icons) {
    if (all.has(icon.id)) continue;
    // Find the next free character, wrapping once around the area.
    for (;;) {
      if (cursor > PUA_END && nextAfter !== undefined && !reassignExisting) {
        throw new ConflictError("The Private Use Area has no new characters left. Clear or manually edit codepoints to reuse existing characters.");
      }
      if (cursor > PUA_END) {
        if (wrapped) throw new ConflictError("The Private Use Area has no free characters left. Remove some icons or clear codepoints.");
        wrapped = true;
        cursor = PUA_START;
      }
      if (wrapped && cursor >= first) throw new ConflictError("The Private Use Area has no free characters left. Remove some icons or clear codepoints.");
      if (!used.has(cursor)) break;
      cursor += 1;
    }
    used.add(cursor);
    all.set(icon.id, cursor);
    assigned.set(icon.id, cursor);
    cursor += 1;
  }
  return { all, assigned };
}

export function conversionWarnings(icons: Pick<FontIcon, "name" | "hasStroke" | "hasGradient" | "hasText">[]) {
  const warnings: { icon: string; message: string }[] = [];
  for (const icon of icons) {
    if (icon.hasStroke) warnings.push({ icon: icon.name, message: "Uses strokes. Icon fonts need filled shapes, so the outline may come out thin or missing until the strokes are turned into outlines." });
    if (icon.hasGradient) warnings.push({ icon: icon.name, message: "Uses a gradient. A font glyph has one colour." });
    if (icon.hasText) warnings.push({ icon: icon.name, message: "Contains text. Turn the text into outlines first." });
  }
  return warnings;
}

// The icons a build covers: everything, one folder with its subfolders, or a chosen list. Trashed icons are never included.
export async function iconsForFont(projectId: Id, input: BuildFontInput): Promise<FontIcon[]> {
  const filter: Record<string, unknown> = { projectId, deletedAt: null };
  if (input.scope === "folder") {
    const folder = input.folderId as string;
    const root = new mongoose.Types.ObjectId(folder);
    filter.folderId = { $in: [root, ...(await descendantIds(projectId, root))] };
  } else if (input.scope === "selected") {
    filter._id = { $in: input.iconIds };
  }
  const rows = await Icon.find(filter).select({ name: 1, slug: 1, svg: 1, codepoint: 1, hasStroke: 1, hasGradient: 1, hasText: 1 }).sort({ slug: 1 }).limit(MAX_FONT_ICONS + 1).lean();
  if (rows.length === 0) throw new BadRequestError("There are no icons to put in the font.");
  if (rows.length > MAX_FONT_ICONS) throw new BadRequestError(`A font can hold ${MAX_FONT_ICONS} icons at most here. Choose a folder or select fewer icons.`);
  return rows.map((row) => ({ id: String(row._id), name: row.name, slug: row.slug, svg: row.svg, codepoint: row.codepoint ?? null, hasStroke: row.hasStroke ?? false, hasGradient: row.hasGradient ?? false, hasText: row.hasText ?? false }));
}

export type FontFile = { name: string; data: Buffer };

export type FontBuild = {
  fontName: string;
  prefix: string;
  iconCount: number;
  warnings: { icon: string; message: string }[];
  // The shared class, when one was asked for (the stylesheet then needs class="base prefix-name").
  baseClass: string;
  codepoints: { id: string; name: string; slug: string; codepoint: string; className: string; isNew: boolean }[];
  css: string;
  // Everything that goes into the ZIP: the requested font files, css, scss, json, html and a README.
  files: FontFile[];
  // A small font for the in-browser preview (always present).
  preview: { format: "woff2"; base64: string };
  sizes: Record<string, number>;
};

export function safeFontName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "") || "IconFont";
}

// Builds the font in a temporary folder using the uploaded codepoints plus any per-visit overrides.
export async function buildFont(projectId: Id, icons: FontIcon[], input: BuildFontInput): Promise<FontBuild> {
  const overrides = new Map((input.codepointOverrides ?? []).map(({ iconId, codepoint }) => [iconId, codepoint]));
  icons = icons.map((icon) => (overrides.has(icon.id) ? { ...icon, codepoint: overrides.get(icon.id) ?? icon.codepoint } : icon));
  // A character outside E000 to F8FF would be written to the wrong place in the font, so the CSS and the font would disagree. Such values can only exist from before this rule; say which icons to fix instead of building something wrong.
  const outside = icons.filter((icon) => icon.codepoint && !isFontCodepoint(icon.codepoint));
  if (outside.length > 0) {
    throw new BadRequestError(`These icons have a character outside E000 to F8FF, which the font cannot hold: ${outside.slice(0, 5).map((icon) => `${icon.name} (${icon.codepoint})`).join(", ")}${outside.length > 5 ? `, and ${outside.length - 5} more` : ""}. Change or clear it in the icon's details.`);
  }
  const [project, allProjectCodepoints] = await Promise.all([
    Project.findById(projectId).select({ uploadCodepointHighWatermark: 1 }).lean(),
    Icon.find({ projectId }).select({ codepoint: 1, deletedAt: 1, _id: 1 }).lean(),
  ]);
  const selectedIds = new Set(icons.map((icon) => icon.id));
  const usedElsewhere = allProjectCodepoints
    .filter((row) => row.deletedAt !== null || !selectedIds.has(String(row._id)))
    .flatMap((row) => {
      const codepoint = overrides.get(String(row._id)) ?? row.codepoint;
      return codepoint ? [parseInt(codepoint, 16)] : [];
    });
  if (!input.reassignCodepoints) {
    const used = new Set(usedElsewhere);
    for (const icon of icons) {
      if (!icon.codepoint) continue;
      const codepoint = parseInt(icon.codepoint, 16);
      if (used.has(codepoint)) throw new ConflictError(`Codepoint ${toHex(codepoint)} is already used by another icon in this font.`);
      used.add(codepoint);
    }
  }
  const highWatermark = allProjectCodepoints.reduce((highest, row) => {
    const codepoint = overrides.get(String(row._id)) ?? row.codepoint;
    const value = codepoint ? parseInt(codepoint, 16) : NaN;
    return Number.isInteger(value) ? Math.max(highest, value) : highest;
  }, Math.max(project?.uploadCodepointHighWatermark ?? 0, ...[...overrides.values()].map((value) => parseInt(value, 16))));
  const plan = planCodepoints(icons, input.startCodepoint, usedElsewhere, input.reassignCodepoints, input.reassignCodepoints ? undefined : highWatermark);

  const fontName = safeFontName(input.fontName);
  const prefix = input.prefix.replace(/-+$/, "") || "icon";
  const root = await mkdtemp(path.join(tmpdir(), "svgfont-"));
  try {
    const inDir = path.join(root, "in");
    const outDir = path.join(root, "out");
    await mkdir(inDir);
    await mkdir(outDir);
    const codepoints: Record<string, number> = {};
    for (const icon of icons) {
      await writeFile(path.join(inDir, `${icon.slug}.svg`), icon.svg, "utf8");
      codepoints[icon.slug] = plan.all.get(icon.id) as number;
    }

    const wanted = [...new Set(input.formats)];
    try {
      await generateFonts({
        inputDir: inDir,
        outputDir: outDir,
        name: fontName,
        // woff2 is always built for the preview; it is left out of the ZIP when not requested.
        fontTypes: [...new Set([...wanted, "woff2"])] as FontAssetType[],
        assetTypes: ["css", "scss", "json", "html"] as OtherAssetType[],
        formatOptions: { json: { indent: 2 } },
        codepoints,
        prefix,
        // A base class turns the shared rule into `.base:before` and each icon into `.base.prefix-name:before`.
        ...(input.baseClass ? { selector: `.${input.baseClass}` } : {}),
        fontHeight: input.fontHeight,
        descent: input.descent,
        normalize: input.normalize,
      });
    } catch (err) {
      throw new BadRequestError(`The font could not be built: ${err instanceof Error ? err.message : "unknown error"}`);
    }

    const files: FontFile[] = [];
    const sizes: Record<string, number> = {};
    let previewBase64 = "";
    for (const name of (await readdir(outDir)).sort()) {
      const data = await readFile(path.join(outDir, name));
      const ext = path.extname(name).slice(1).toLowerCase();
      if (ext === "woff2") previewBase64 = data.toString("base64");
      const isFont = ["ttf", "woff", "woff2", "eot", "svg"].includes(ext);
      if (isFont && !wanted.includes(ext as (typeof wanted)[number])) continue;
      files.push({ name, data });
      if (isFont) sizes[ext] = data.length;
    }
    files.push({ name: "README.md", data: Buffer.from(readme(fontName, prefix, icons, wanted, input.baseClass)) });

    const css = files.find((file) => file.name === `${fontName}.css`)?.data.toString("utf8") ?? "";
    return {
      fontName,
      prefix,
      baseClass: input.baseClass,
      iconCount: icons.length,
      warnings: conversionWarnings(icons),
      codepoints: icons.map((icon) => ({ id: icon.id, name: icon.name, slug: icon.slug, codepoint: toHex(plan.all.get(icon.id) as number), className: `${prefix}-${icon.slug}`, isNew: plan.assigned.has(icon.id) })),
      css,
      files,
      preview: { format: "woff2", base64: previewBase64 },
      sizes,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function readme(fontName: string, prefix: string, icons: FontIcon[], formats: string[], baseClass = ""): string {
  const sample = icons[0]?.slug ?? "icon";
  return `# ${fontName}\n\nAn icon font with ${icons.length} icons. Formats: ${formats.join(", ")}.\n\n## Use it\n\n1. Link the stylesheet:\n\n   <link rel="stylesheet" href="${fontName}.css">\n\n2. Add an icon:\n\n   <i class="${baseClass ? `${baseClass} ` : ""}${prefix}-${sample}"></i>\n\nOpen ${fontName}.html to see every icon with its class name. ${fontName}.json maps each icon to its character code, and stays the same when the font is rebuilt.\n`;
}

const FONT_FORMATS: Record<string, { mime: string; format: string }> = {
  eot: { mime: "application/vnd.ms-fontobject", format: "embedded-opentype" },
  svg: { mime: "image/svg+xml", format: "svg" },
  ttf: { mime: "font/ttf", format: "truetype" },
  woff: { mime: "font/woff", format: "woff" },
  woff2: { mime: "font/woff2", format: "woff2" },
};

function fontFaceCss(css: string, sources: string[]): string {
  const result = css.replace(/src\s*:[^;]*;/i, `src:\n  ${sources.join(",\n  ")};`);
  if (result === css) throw new Error("The generated font stylesheet has no @font-face source.");
  return result;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function fontDemoHtml(build: FontBuild): string {
  const tiles = build.codepoints.map((icon) => `
<li class="litile">
<div class="innerTile">
<div class="iconouterdiv"><div class="iconinnerdiv"><i aria-hidden="true" class="${escapeHtml(build.baseClass ? `${build.baseClass} ` : "")}${escapeHtml(icon.className)} icon"></i></div></div>
<div class="txtouterdiv"><div class="txtinnerdiv"><span class="nametxt">Name</span><span class="valuetxt">${escapeHtml(icon.slug)}</span></div></div>
<div class="txtouterdiv"><div class="txtinnerdiv"><span class="nametxt">Unicode</span><span class="valuetxt">${escapeHtml(icon.codepoint.toLowerCase())}</span></div></div>
</div>
</li>`).join("");

  return `<!doctype html>
<html>
<head>
<title>Font Icon</title>
<link rel="stylesheet" href="style.css">
<style>
#wrapper {width: 500px; margin: 0 auto; }
p {margin: 0px; }
.ultile { display: inline-block; list-style-type: none; margin: 0; padding: 0; width: 100%; list-style-position: outside; }
.litile { float: left; height: 150px; width: 150px; padding: 15px 8px 0 8px; display: list-item; text-align: -webkit-match-parent;}
.innerTile {background-color: white; width: 100%; height: 100%; -webkit-box-sizing: content-box; -moz-box-sizing: content-box; box-sizing: content-box; -moz-box-shadow: rgba(0, 0, 0, 0.6) 1px 1px 1px; -webkit-box-shadow: rgba(0, 0, 0, 0.6) 1px 1px 1px; box-shadow: rgba(0, 0, 0, 0.6) 1px 1px 1px; border-color: gray; border-radius: 10px; }
.iconouterdiv {height: 43%; width: 100%; position: relative; margin: 0 auto;}
.iconinnerdiv {height: 100%; width: 100%; display: block; text-align: center; vertical-align: middle;}
.txtouterdiv {height: 22%; width: 100%;}
.txtinnerdiv {text-align: left; margin-left: 10px; margin-top: 5px}
.nametxt {color: #4791F9; display: block; font-size: 12px; font-family: Segoe UI;}
.valuetxt {display: block; font-size: 15px; font-family: Segoe UI; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
.icon {display: inline-block; vertical-align: middle; line-height: 1; margin-top: 10%; font-size: 40px;}
</style>
</head>
<body style="background-color:#F4F4F4">
<div style="width:100%;text-align:center;height:100%;display:block;top:30px;position:absolute">
<div id="headingDiv" style="width:80%;text-align:center;position:relative;margin:0 auto;">
<div style="text-align:left;margin-left:10px;">
<p style="color:darkblue;">Font Name : ${escapeHtml(build.fontName)}</p></div></div>
<div id="tileDiv" style="width:80%;text-align:center;position:relative;margin:0 auto;">
<ul class="ultile">
${tiles}
</ul></div></div>
</body>
</html>`;
}

// A ZIP matching the familiar font-editor layout: linked assets in Fonts/, plus an embedded-font variant.
export function zipFontBuild(build: FontBuild): Buffer {
  const fonts = build.files.filter((file) => FONT_FORMATS[path.extname(file.name).slice(1).toLowerCase()]);
  const css = build.files.find((file) => path.extname(file.name).toLowerCase() === ".css");
  const library = build.files.find((file) => path.extname(file.name).toLowerCase() === ".json");
  if (fonts.length === 0 || !css || !library) throw new Error("The font build is missing files required for its ZIP package.");

  const available = new Set(fonts.map((file) => file.name));
  const faceSources = [...css.data.toString("utf8").matchAll(/url\((['"]?)([^)'"]+)\1\)\s*format\((['"]?)([^)'"]+)\3\)/g)]
    .flatMap((match) => {
      const url = match[2] as string;
      const name = path.basename(url.split(/[?#]/, 1)[0] ?? url);
      if (!available.has(name)) return [];
      const suffix = url.slice(url.indexOf(name) + name.length);
      return [`url("Fonts/${name}${suffix}") format("${match[4]}")`];
    });
  if (faceSources.length === 0) throw new Error("The generated font stylesheet has no available font files.");

  const mainCss = fontFaceCss(css.data.toString("utf8"), faceSources);
  const embeddedFont = ["ttf", "woff", "woff2", "eot", "svg"]
    .map((extension) => fonts.find((file) => path.extname(file.name).toLowerCase() === `.${extension}`))
    .find((file) => file !== undefined);
  if (!embeddedFont) throw new Error("The font build has no font file to embed.");
  const embeddedType = FONT_FORMATS[path.extname(embeddedFont.name).slice(1).toLowerCase()];
  if (!embeddedType) throw new Error(`The font format ${path.extname(embeddedFont.name)} cannot be embedded.`);
  const dataUri = `url("data:${embeddedType.mime};base64,${embeddedFont.data.toString("base64")}") format("${embeddedType.format}")`;
  const embeddedCss = fontFaceCss(css.data.toString("utf8"), [dataUri]);
  const demoHtml = fontDemoHtml(build);

  const input: Record<string, Uint8Array> = {
    "demo.html": new Uint8Array(Buffer.from(demoHtml)),
    "library.json": new Uint8Array(library.data),
    "style.css": new Uint8Array(Buffer.from(mainCss)),
    "Embed Font in CSS/demo.html": new Uint8Array(Buffer.from(demoHtml)),
    "Embed Font in CSS/style.css": new Uint8Array(Buffer.from(embeddedCss)),
  };
  for (const font of fonts) input[`Fonts/${font.name}`] = new Uint8Array(font.data);
  return Buffer.from(zipSync(input, { level: 6 }));
}
