// Reading glyphs out of an existing font so they can become icons: TTF, OTF, WOFF, WOFF2 and SVG fonts. The font type is recognised from the file's first bytes, not its name. Each glyph with an outline becomes a standalone SVG (which then goes through the normal cleaning pipeline like any upload). An optional CSS or JSON file maps characters to class names so the icons get meaningful names.
import { JSDOM } from "jsdom";
import opentype from "opentype.js";
import wawoff2 from "wawoff2";
import { BadRequestError } from "../lib/errors.js";
import { isFontCodepoint } from "../lib/codepoint.js";
import Icon from "../models/Icon.js";
import type { Types } from "mongoose";
import { importSvg, serializeIcon, type Strategy } from "./iconService.js";

export const MAX_FONT_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 24 * 1024 * 1024;
export const MAX_GLYPHS = 2000;

export type Glyph = { name: string; svg: string; codepoint: string | null };
export type GlyphRead = { glyphs: Glyph[]; total: number; truncated: boolean; kind: "truetype" | "opentype" | "woff" | "woff2" | "svg" };

// Maps a character (lower-case hex) to a name. Accepts a fantasticon or IcoMoon style CSS file (`.icon-heart:before { content: "\e001"; }`) or a JSON object of name to number or string.
export function parseMapping(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const trimmed = (text ?? "").trim();
  if (!trimmed) return map;
  if (trimmed.startsWith("{")) {
    try {
      for (const [key, value] of Object.entries(JSON.parse(trimmed) as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value)) map.set(value.toString(16).toLowerCase(), key);
        else if (typeof value === "string") {
          const hex = value.replace(/^\\?u?\+?0*x?/i, "").toLowerCase();
          if (/^[0-9a-f]{1,6}$/.test(hex)) map.set(hex, key);
        }
      }
      return map;
    } catch {
      // not JSON: try it as CSS
    }
  }
  const css = /\.([a-zA-Z0-9_-]+)::?before\s*\{[^}]*content:\s*["']\\?([a-fA-F0-9]{1,6})["']/g;
  for (const match of trimmed.matchAll(css)) {
    const name = (match[1] as string).replace(/^(icon|fa|glyph|ri|bi)-/i, "") || (match[1] as string);
    map.set((match[2] as string).toLowerCase().replace(/^0+(?=.)/, ""), name);
  }
  return map;
}

const normalizeHex = (hex: string) => hex.toLowerCase().replace(/^0+(?=.)/, "");

// A name worth keeping: not an automatic one such as "uniE001" or "glyph12".
function usableGlyphName(name: string | null | undefined): name is string {
  if (!name) return false;
  return !/^(\.notdef|\.null|space|nonmarkingreturn|glyph\d*|uni[0-9a-f]{4,6}|u[0-9a-f]{4,6}|cid\d+|gid\d+)$/i.test(name);
}

function nameFor(hex: string | null, glyphName: string | null | undefined, mapping: Map<string, string>, index: number): string {
  if (hex && mapping.has(normalizeHex(hex))) return mapping.get(normalizeHex(hex)) as string;
  if (usableGlyphName(glyphName)) return glyphName;
  return hex ? `icon-${hex.toLowerCase()}` : `glyph-${index}`;
}

function sniff(buffer: Buffer): GlyphRead["kind"] {
  const tag = buffer.subarray(0, 4).toString("latin1");
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "opentype";
  if (tag === "true" || (buffer[0] === 0 && buffer[1] === 1 && buffer[2] === 0 && buffer[3] === 0)) return "truetype";
  if (buffer.subarray(0, 400).toString("utf8").includes("<")) return "svg";
  throw new BadRequestError("That is not a font file this tool can read. Use a TTF, OTF, WOFF, WOFF2 or SVG font.");
}

export async function readFontGlyphs(buffer: Buffer, mappingText = ""): Promise<GlyphRead> {
  if (buffer.length === 0) throw new BadRequestError("The font file is empty.");
  if (buffer.length > MAX_FONT_BYTES) throw new BadRequestError("The font file is larger than 8 MB.");
  const mapping = parseMapping(mappingText);
  const kind = sniff(buffer);
  return kind === "svg" ? readSvgFont(buffer, mapping) : readBinaryFont(buffer, kind, mapping);
}

async function readBinaryFont(buffer: Buffer, kind: GlyphRead["kind"], mapping: Map<string, string>): Promise<GlyphRead> {
  let bytes = buffer;
  if (kind === "woff2") {
    // The header says how big the font will be once unpacked (totalSfntSize, bytes 16 to 19). Check that first so a tiny file cannot make the server allocate gigabytes.
    if (buffer.length >= 20 && buffer.readUInt32BE(16) > MAX_UNPACKED_BYTES) throw new BadRequestError("That font unpacks to more than 24 MB.");
    try {
      bytes = Buffer.from(await wawoff2.decompress(buffer));
    } catch {
      throw new BadRequestError("That WOFF2 file could not be unpacked. It may be damaged.");
    }
    if (bytes.length > MAX_UNPACKED_BYTES) throw new BadRequestError("That font unpacks to more than 24 MB.");
  }
  let font: opentype.Font;
  try {
    font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new BadRequestError("That font file could not be read. It may be damaged or use an unsupported format.");
  }
  const unitsPerEm = font.unitsPerEm || 1000;
  const ascender = font.ascender || unitsPerEm;
  const height = Math.max(1, ascender - (font.descender || 0));

  const glyphs: Glyph[] = [];
  let total = 0;
  for (let i = 0; i < font.glyphs.length; i += 1) {
    const glyph = font.glyphs.get(i);
    if (glyph.name === ".notdef" || glyph.name === ".null") continue;
    const data = glyph.getPath(0, ascender, unitsPerEm).toPathData(2);
    if (!data || data.trim().length === 0) continue;
    total += 1;
    if (glyphs.length >= MAX_GLYPHS) continue;
    const hex = glyph.unicode ? glyph.unicode.toString(16).toUpperCase().padStart(4, "0") : null;
    const width = Math.max(1, glyph.advanceWidth || height);
    glyphs.push({ name: nameFor(hex, glyph.name, mapping, i), svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${data}" fill="currentColor"/></svg>`, codepoint: hex });
  }
  return { glyphs, total, truncated: total > glyphs.length, kind };
}

function readSvgFont(buffer: Buffer, mapping: Map<string, string>): GlyphRead {
  let doc: Document;
  try {
    doc = new JSDOM(buffer.toString("utf8"), { contentType: "image/svg+xml" }).window.document;
  } catch {
    throw new BadRequestError("That SVG font is not well-formed XML.");
  }
  const face = doc.querySelector("font-face");
  const font = doc.querySelector("font");
  const unitsPerEm = parseInt(face?.getAttribute("units-per-em") ?? "", 10) || 1000;
  const ascent = parseInt(face?.getAttribute("ascent") ?? "", 10) || Math.round(unitsPerEm * 0.8);
  const descent = parseInt(face?.getAttribute("descent") ?? "", 10) || 0;
  const defaultAdvance = parseInt(font?.getAttribute("horiz-adv-x") ?? "", 10) || unitsPerEm;
  const height = Math.max(1, ascent + Math.abs(descent));

  const glyphs: Glyph[] = [];
  let total = 0;
  const nodes = Array.from(doc.querySelectorAll("glyph"));
  for (const [index, node] of nodes.entries()) {
    const d = node.getAttribute("d");
    if (!d || !d.trim()) continue;
    total += 1;
    if (glyphs.length >= MAX_GLYPHS) continue;
    const code = (node.getAttribute("unicode") ?? "").codePointAt(0);
    const hex = code ? code.toString(16).toUpperCase().padStart(4, "0") : null;
    const width = Math.max(1, parseInt(node.getAttribute("horiz-adv-x") ?? "", 10) || defaultAdvance);
    // SVG fonts have the y axis pointing up from the baseline; flip it and move the baseline to `ascent`.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><g transform="translate(0 ${ascent}) scale(1 -1)"><path d="${d.replace(/"/g, "&quot;")}" fill="currentColor"/></g></svg>`;
    glyphs.push({ name: nameFor(hex, node.getAttribute("glyph-name") ?? undefined, mapping, index), svg, codepoint: hex });
  }
  return { glyphs, total, truncated: total > glyphs.length, kind: "svg" };
}

// Glyphs whose character is in the basic Private Use Area (E000 to F8FF), which is where icon fonts keep their icons.
export function privateUseOnly(glyphs: Glyph[]): Glyph[] {
  return glyphs.filter((glyph) => glyph.codepoint !== null && isFontCodepoint(glyph.codepoint));
}

export type GlyphImportSummary = {
  created: ReturnType<typeof serializeIcon>[];
  replaced: ReturnType<typeof serializeIcon>[];
  skipped: { name: string; reason: string }[];
  errors: { file: string; message: string }[];
  codepointsKept: number;
  codepointsDropped: number;
};

// Adds glyphs to a project through the normal import (cleaned, optimized on request, name clashes handled by `strategy`). A glyph keeps its character when that is a free Private Use codepoint; otherwise it just loses it and is counted.
export async function importGlyphs(projectId: Types.ObjectId, glyphs: Glyph[], options: { strategy: Strategy; optimize: boolean; folderId: Types.ObjectId | null }): Promise<GlyphImportSummary> {
  const summary: GlyphImportSummary = { created: [], replaced: [], skipped: [], errors: [], codepointsKept: 0, codepointsDropped: 0 };
  for (const glyph of glyphs) {
    try {
      const outcome = await importSvg(projectId, { name: glyph.name, raw: glyph.svg, folderId: options.folderId, tags: [] }, { strategy: options.strategy, optimize: options.optimize });
      if (outcome.status === "skipped") {
        summary.skipped.push({ name: outcome.name, reason: outcome.reason });
        continue;
      }
      let icon = outcome.icon;
      if (glyph.codepoint && isFontCodepoint(glyph.codepoint)) {
        const taken = await Icon.exists({ projectId, codepoint: glyph.codepoint, deletedAt: null, _id: { $ne: icon._id } });
        if (taken) {
          summary.codepointsDropped += 1;
        } else {
          try {
            icon.codepoint = glyph.codepoint;
            icon = await icon.save();
            summary.codepointsKept += 1;
          } catch {
            icon.codepoint = null;
            summary.codepointsDropped += 1;
          }
        }
      }
      (outcome.status === "created" ? summary.created : summary.replaced).push(serializeIcon(icon, false));
    } catch (err) {
      summary.errors.push({ file: glyph.name, message: err instanceof Error ? err.message : "Could not add this glyph." });
    }
  }
  return summary;
}
