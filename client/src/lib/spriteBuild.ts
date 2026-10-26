// Turns a project's icons into a sprite and a sprite back into icons. Building uses the compiler's existing in-browser engine (symbol ids, sprite document, grid sprite, demo page); this file adapts project icons to it and applies the sprite options: the architecture (symbols, a stack or symbols with a CSS companion), the symbol id pattern, converting colours to currentColor and namespacing the ids inside each icon. By default each icon becomes one <symbol> with the id `<project prefix>-<slug>`, the same id the icon drawer shows.
import { buildSpriteXml, extractSymbolsFromSprite, sortSymbolsById, type SpriteSymbol } from "../utils/buildDemo";

export type SpriteIconInput = { name: string; slug: string; svg: string };

export type SpriteMode = "symbol" | "stack" | "css";

export type SpriteOptions = {
  mode: SpriteMode;
  // How a symbol id is made: {prefix} is the project's prefix and {name} the icon's slug.
  idPattern: string;
  // Turn every colour into currentColor so the icon takes the text colour.
  stripColors: boolean;
  // Rename the ids inside an icon (gradients, masks, clip paths) so two icons never clash.
  namespaceIds: boolean;
};

export const DEFAULT_SPRITE_OPTIONS: SpriteOptions = { mode: "symbol", idPattern: "{prefix}-{name}", stripColors: false, namespaceIds: true };

// The message to show when an id pattern cannot be used, or null when it is fine. It must hold {name}, so two icons never get the same id, and use only letters, digits, - and _ around the {} placeholders.
export function idPatternProblem(pattern: string): string | null {
  if (!pattern.includes("{name}")) return "The id pattern must contain {name}, so every icon gets its own id.";
  if (!/^([a-zA-Z0-9_-]|\{prefix\}|\{name\})+$/.test(pattern)) return "Use only letters, digits, - and _ with {prefix} and {name}.";
  return null;
}

export function formatSymbolId(pattern: string, prefix: string, slug: string): string {
  return pattern.split("{prefix}").join(prefix).split("{name}").join(slug);
}

export type BuiltSprite = {
  // The sprite in the chosen architecture: what is downloaded and copied.
  xml: string;
  // The same icons as a symbol sprite, which the preview, the grid sprite and the preview image always use.
  symbolXml: string;
  mode: SpriteMode;
  // The companion stylesheet in the CSS mode.
  css: string | null;
  ids: string[];
  // Names of icons that could not be turned into a symbol (the SVG could not be read).
  skipped: string[];
};

// Reads an icon's SVG into a symbol. The root's presentation attributes (fill, stroke, ...) move onto a wrapping <g> so they survive inside the symbol. Returns null when the markup is not an SVG.
export function svgToSymbol(svgText: string, id: string): SpriteSymbol | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) return null;
  let viewBox = svg.getAttribute("viewBox") || "";
  if (!viewBox) {
    const width = parseFloat(svg.getAttribute("width") || "24") || 24;
    const height = parseFloat(svg.getAttribute("height") || "24") || 24;
    viewBox = `0 0 ${width} ${height}`;
  }
  const ignored = new Set(["id", "width", "height", "xmlns", "xmlns:xlink", "version", "class", "viewBox"]);
  const attributes = Array.from(svg.attributes)
    .filter((attribute) => !ignored.has(attribute.name))
    .map((attribute) => ` ${attribute.name}="${attribute.value.replace(/"/g, "&quot;")}"`)
    .join("");
  return { id, viewBox, inner: `<g${attributes}>${svg.innerHTML}</g>` };
}

export function symbolId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`;
}

const COLOR_ATTRS = ["fill", "stroke"];
const SHAPES = "path, circle, rect, polygon, polyline, ellipse, line, g";
const ID_REFERENCES = ["fill", "stroke", "clip-path", "mask", "filter", "href", "xlink:href"];

// Applies the per-icon options to an icon's SVG text: colours to currentColor, and the ids inside the icon renamed with the icon's slug. Returns the text unchanged when it cannot be read.
export function prepareSvg(svgText: string, slug: string, options: Pick<SpriteOptions, "stripColors" | "namespaceIds">): string {
  if (!options.stripColors && !options.namespaceIds) return svgText;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg || doc.querySelector("parsererror")) return svgText;
  if (options.stripColors) {
    for (const element of [svg, ...Array.from(svg.querySelectorAll(SHAPES))]) {
      for (const name of COLOR_ATTRS) {
        const value = element.getAttribute(name);
        if (value && !["none", "transparent", "currentColor", "inherit"].includes(value) && !value.startsWith("url(")) element.setAttribute(name, "currentColor");
      }
    }
  }
  if (options.namespaceIds) {
    const renamed = new Map<string, string>();
    for (const element of Array.from(svg.querySelectorAll("[id]"))) {
      const old = element.getAttribute("id") ?? "";
      if (!old) continue;
      const next = `${slug}-${old}`;
      renamed.set(old, next);
      element.setAttribute("id", next);
    }
    if (renamed.size > 0) {
      for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
        for (const name of ID_REFERENCES) {
          const value = element.getAttribute(name);
          if (!value) continue;
          let changed = value;
          for (const [old, next] of renamed) {
            changed = changed.split(`url(#${old})`).join(`url(#${next})`);
            if (changed === `#${old}`) changed = `#${next}`;
          }
          if (changed !== value) element.setAttribute(name, changed);
        }
      }
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

// What a stack sprite looks like: every icon is a nested <svg> that only shows when its id is the page's target (used by <img src="sprite.svg#id"> or a background).
function stackXml(symbols: SpriteSymbol[]): string {
  const items = symbols.map((symbol) => `  <svg id="${symbol.id}" viewBox="${symbol.viewBox}">${symbol.inner}</svg>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg">\n  <style>:root > svg { display: none; } :root > svg:target { display: inline; }</style>\n${items}\n</svg>`;
}

function companionCss(ids: string[]): string {
  const rules = ids.map((id) => `.${id} { /* symbol id: ${id} */ }`).join("\n");
  return `/* Companion stylesheet for the sprite. Use <svg class="icon"><use href="sprite.svg#id"></use></svg>. */\n.icon {\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n  fill: currentColor;\n  vertical-align: -0.125em;\n}\n\n${rules}\n`;
}

// The code that shows one symbol, for the chosen architecture.
export function snippetFor(mode: SpriteMode, id: string, spriteFile = "sprite.svg"): string {
  if (mode === "stack") return `<img src="${spriteFile}#${id}" width="24" height="24" alt="">`;
  if (mode === "css") return `<svg class="icon"><use href="${spriteFile}#${id}"></use></svg>`;
  return `<svg width="24" height="24"><use href="#${id}"></use></svg>`;
}

export function buildSprite(icons: SpriteIconInput[], prefix: string, options: SpriteOptions = DEFAULT_SPRITE_OPTIONS): BuiltSprite {
  const symbols: SpriteSymbol[] = [];
  const skipped: string[] = [];
  const pattern = idPatternProblem(options.idPattern) ? DEFAULT_SPRITE_OPTIONS.idPattern : options.idPattern;
  for (const icon of icons) {
    const symbol = svgToSymbol(prepareSvg(icon.svg, icon.slug, options), formatSymbolId(pattern, prefix, icon.slug));
    if (symbol) symbols.push(symbol);
    else skipped.push(icon.name);
  }
  const sorted = sortSymbolsById(symbols);
  const ids = sorted.map((symbol) => symbol.id);
  const symbolXml = buildSpriteXml(sorted);
  return { xml: options.mode === "stack" ? stackXml(sorted) : symbolXml, symbolXml, mode: options.mode, css: options.mode === "css" ? companionCss(ids) : null, ids, skipped };
}

export type SpriteImport = {
  files: File[];
  // How many symbols the sprite holds (the same as files.length).
  count: number;
};

// The file name an imported symbol gets: its id without the project's own prefix, so importing a sprite that came from this project does not double the prefix.
function importName(id: string, prefix: string): string {
  const stripped = id.startsWith(`${prefix}-`) && id.length > prefix.length + 1 ? id.slice(prefix.length + 1) : id;
  return `${stripped}.svg`;
}

// Splits a sprite document into one standalone SVG file per <symbol>, ready for the normal upload (which cleans, optimizes and handles name clashes). Returns null when the text is not a sprite.
export function spriteToFiles(spriteText: string, prefix: string): SpriteImport | null {
  const symbols = extractSymbolsFromSprite(spriteText);
  if (symbols.length === 0) return null;
  const files = symbols.map((symbol) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}">${symbol.inner}</svg>`;
    return new File([svg], importName(symbol.id, prefix), { type: "image/svg+xml" });
  });
  return { files, count: files.length };
}
