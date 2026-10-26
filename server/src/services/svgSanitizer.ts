// Cleans untrusted SVG markup and reports what it contains. Icons are shown to other users, so everything that can run code or load something from outside is removed: scripts, event handlers, foreignObject, raster images, <style> blocks (after their rules are inlined), external links, external url() references and XML entities.
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { optimize } from "svgo";
import { BadRequestError } from "../lib/errors.js";

export type SvgInfo = {
  width: number;
  height: number;
  viewBox: string;
  hasStroke: boolean;
  hasGradient: boolean;
  hasText: boolean;
  warnings: string[];
};

export type SanitizedSvg = SvgInfo & { svg: string };

// Largest markup accepted for one icon, in bytes.
export const MAX_SVG_BYTES = 1_000_000;

// Shape limits, so one icon cannot make a browser stall. MAX_EXPANDED counts the elements drawn once every <use> is replaced by what it points to (nested <use> can multiply: ten levels that each use the one below make a thousand copies).
export const MAX_ELEMENTS = 5_000;
export const MAX_DEPTH = 32;
export const MAX_EXPANDED = 50_000;

const SVG_NS = "http://www.w3.org/2000/svg";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

// Only these elements and attributes survive. Filters and <style> are intentionally absent.
const ALLOWED_TAGS = [
  "svg", "g", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse",
  "defs", "clipPath", "mask", "pattern", "linearGradient", "radialGradient", "stop",
  "text", "tspan", "symbol", "use",
];

const ALLOWED_ATTR = [
  "xmlns", "xmlns:xlink", "version", "viewBox", "preserveAspectRatio", "width", "height",
  "id", "class", "style", "transform",
  "fill", "fill-rule", "fill-opacity", "clip-rule", "opacity", "color", "display", "visibility",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "vector-effect", "shape-rendering",
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "points", "dx", "dy",
  "clip-path", "clipPathUnits", "mask", "maskUnits", "maskContentUnits",
  "pattern", "patternUnits", "patternContentUnits", "patternTransform",
  "offset", "stop-color", "stop-opacity", "gradientTransform", "gradientUnits", "spreadMethod",
  "href", "xlink:href",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "letter-spacing",
];

// Style declarations and attribute values that must never survive.
const BAD_STYLE_DECLARATION = /url\(\s*['"]?\s*(?!#)|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i;
const EXTERNAL_URL_VALUE = /url\(\s*['"]?\s*(?!#)/i;
// Style properties an icon has no business setting: they could pull it out of its box and over the page, or are expensive to draw.
const BAD_STYLE_PROPERTY = /^\s*(position|z-index|top|right|bottom|left|inset[\w-]*|pointer-events|filter|backdrop-filter|animation[\w-]*|transition[\w-]*|will-change|content)\s*:/i;
const EXTERNAL_HREF = /^\s*(https?:|\/\/|javascript:|data:)/i;

// Runs the stylesheet rules from <style> blocks into style="" attributes, so colours survive when the blocks are removed. Failure is harmless: the markup just goes on unchanged.
function inlineStyleBlocks(markup: string): string {
  if (!/<style[\s>]/i.test(markup)) return markup;
  try {
    return optimize(markup, { plugins: ["inlineStyles"] }).data;
  } catch {
    return markup;
  }
}

// Splits a style attribute into declarations, ignoring semicolons inside brackets or quotes (as in url(data:...;base64,...)).
function splitDeclarations(style: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (ch === ";" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function cleanStyleAttribute(style: string): string {
  return splitDeclarations(style)
    .filter((declaration) => !BAD_STYLE_DECLARATION.test(declaration) && !BAD_STYLE_PROPERTY.test(declaration))
    .join(";");
}

function parseLength(value: string | null): number | null {
  if (value == null) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(value);
  if (!match || match[1] === undefined) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

function parseViewBox(value: string | null): [number, number, number, number] | null {
  if (!value) return null;
  const nums = value.trim().split(/[\s,]+/).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = nums as [number, number, number, number];
  return w > 0 && h > 0 ? [x, y, w, h] : null;
}

function parseSvgDocument(markup: string): Document {
  const doc = new window.DOMParser().parseFromString(markup, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") {
    throw new BadRequestError("Invalid SVG: the markup could not be parsed.");
  }
  return doc;
}

function elementDepth(el: Element): number {
  let depth = 0;
  for (let node: Element | null = el; node; node = node.parentElement) depth += 1;
  return depth;
}

// Rejects icons that are absurdly large, deeply nested or that multiply through <use>. Throws BadRequestError.
export function assertReasonableShape(root: Element): void {
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  if (all.length > MAX_ELEMENTS) throw new BadRequestError(`Invalid SVG: more than ${MAX_ELEMENTS} elements.`);
  if (all.some((el) => elementDepth(el) > MAX_DEPTH)) throw new BadRequestError(`Invalid SVG: elements are nested more than ${MAX_DEPTH} levels deep.`);

  const byId = new Map<string, Element>();
  for (const el of all) {
    const id = el.getAttribute("id");
    if (id && !byId.has(id)) byId.set(id, el);
  }
  const memo = new Map<Element, number>();
  const active = new Set<Element>();
  const size = (el: Element): number => {
    const known = memo.get(el);
    if (known !== undefined) return known;
    if (active.has(el)) throw new BadRequestError("Invalid SVG: an element uses itself.");
    active.add(el);
    let total = 1;
    if (el.localName === "use") {
      const href = (el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "").trim();
      const target = href.startsWith("#") ? byId.get(href.slice(1)) : undefined;
      if (target) total += size(target);
    }
    for (const child of Array.from(el.children)) total += size(child);
    active.delete(el);
    if (total > MAX_EXPANDED) throw new BadRequestError("Invalid SVG: too many repeated <use> copies.");
    memo.set(el, total);
    return total;
  };
  size(root);
}

function strokeValueIsPaint(value: string | null): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "none" && v !== "transparent";
}

// Reads size, viewBox and content flags from a parsed document. Adds a viewBox when missing, because icons need one to scale.
function analyze(doc: Document): SvgInfo {
  const root = doc.documentElement;

  const vb = parseViewBox(root.getAttribute("viewBox"));
  const widthAttr = parseLength(root.getAttribute("width"));
  const heightAttr = parseLength(root.getAttribute("height"));
  const width = Math.max(1, Math.round(widthAttr ?? vb?.[2] ?? 24));
  const height = Math.max(1, Math.round(heightAttr ?? vb?.[3] ?? 24));
  const viewBox = vb ? vb.join(" ") : `0 0 ${width} ${height}`;
  if (!vb) root.setAttribute("viewBox", viewBox);

  let hasStroke = strokeValueIsPaint(root.getAttribute("stroke"));
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of all) {
    if (strokeValueIsPaint(el.getAttribute("stroke"))) hasStroke = true;
    const style = el.getAttribute("style");
    if (style && /(^|;)\s*stroke\s*:\s*(?!none\b|transparent\b)/i.test(style)) hasStroke = true;
  }
  const hasGradient = root.querySelectorAll("linearGradient, radialGradient").length > 0;
  const hasText = root.querySelectorAll("text, tspan").length > 0;

  const warnings: string[] = [];
  if (hasStroke) warnings.push("Contains strokes. Icon fonts need filled outlines instead of strokes.");
  if (hasGradient) warnings.push("Contains gradients. Icon fonts only render solid single-colour glyphs.");
  if (hasText) warnings.push("Contains text. Text should be converted to outlines.");

  return { width, height, viewBox, hasStroke, hasGradient, hasText, warnings };
}

// Reads an already clean SVG (for example after optimizing) and returns fresh size and flags. Throws if it cannot be parsed.
export function inspectSvg(markup: string): SvgInfo {
  return analyze(parseSvgDocument(markup));
}

// Cleans untrusted markup. Throws BadRequestError for anything that is not a usable SVG.
export function sanitizeSvg(raw: string | Buffer): SanitizedSvg {
  let markup = (typeof raw === "string" ? raw : raw.toString("utf8")).replace(/^﻿/, "").trim();

  if (Buffer.byteLength(markup, "utf8") > MAX_SVG_BYTES) {
    throw new BadRequestError("SVG is larger than 1 MB.");
  }
  // Entity declarations enable XML entity expansion attacks.
  if (/<!ENTITY/i.test(markup)) {
    throw new BadRequestError("Invalid SVG: XML entities are not permitted.");
  }
  if (!/<svg[\s>]/i.test(markup)) {
    throw new BadRequestError("Invalid file: the content is not an SVG document.");
  }

  markup = inlineStyleBlocks(markup);

  // The file must be well-formed XML. Without this check the HTML-style parser used for cleaning would quietly "repair" broken markup into an empty or partial icon.
  parseSvgDocument(markup);

  const purified = DOMPurify.sanitize(markup, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "foreignObject", "link", "meta", "audio", "video", "style", "image", "filter"],
    ALLOW_DATA_ATTR: false,
  });
  if (!purified || !/<svg[\s>]/i.test(purified)) {
    throw new BadRequestError("SVG sanitization failed: no valid SVG content remained.");
  }

  const doc = parseSvgDocument(purified);
  const root = doc.documentElement;

  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "href" || name === "xlink:href") {
        if (EXTERNAL_HREF.test(attr.value)) el.removeAttribute(attr.name);
      } else if (name === "style") {
        const cleaned = cleanStyleAttribute(attr.value);
        if (cleaned) el.setAttribute("style", cleaned);
        else el.removeAttribute("style");
      } else if (EXTERNAL_URL_VALUE.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  assertReasonableShape(root);
  const info = analyze(doc);

  let svg = root.outerHTML;
  if (!/<svg\b[^>]*\sxmlns=/.test(svg)) {
    svg = svg.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  }

  return { svg, ...info };
}
