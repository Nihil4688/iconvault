// Turns an icon's SVG markup into ready-to-paste code: a React component (TSX) or a Vue 3 component. Attributes are converted properly for JSX (class to className, hyphenated names to camelCase, style strings to objects, xlink:href to xlinkHref, xmlns dropped), so the output compiles as written.

// "Arrow Left" -> "ArrowLeftIcon". Names that would start with a digit get an "Icon" prefix first.
export function componentNameFromIcon(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  const base = pascal || "Icon";
  const safe = /^[0-9]/.test(base) ? `Icon${base}` : base;
  return /Icon$/.test(safe) ? safe : `${safe}Icon`;
}

function parseSvg(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg") {
    throw new Error("The SVG could not be read.");
  }
  return root;
}

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function jsxAttributeName(name: string): string | null {
  if (name === "xmlns" || name.startsWith("xmlns:")) return null;
  if (name === "class") return "className";
  if (name.startsWith("xlink:")) return `xlink${name.slice(6).charAt(0).toUpperCase()}${name.slice(7)}`;
  if (name.startsWith("xml:")) return `xml${name.slice(4).charAt(0).toUpperCase()}${name.slice(5)}`;
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  return camel(name);
}

function jsxString(value: string): string {
  return `"${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`;
}

// style="fill:red;stroke-width:2" -> { fill: "red", strokeWidth: "2" }
function styleObject(style: string): string {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  const declarations: string[] = [];
  for (const ch of style) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      declarations.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  declarations.push(current);
  for (const declaration of declarations) {
    const colon = declaration.indexOf(":");
    if (colon < 1) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (!property || !value) continue;
    const key = property.startsWith("--") ? JSON.stringify(property) : camel(property);
    entries.push(`${key}: ${JSON.stringify(value)}`);
  }
  return `{{ ${entries.join(", ")} }}`;
}

const JSX_TEXT_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "{": '{"{"}', "}": '{"}"}' };

// One pass, so the replacements are never escaped again.
function jsxText(text: string): string {
  return text.replace(/[&<>{}]/g, (ch) => JSX_TEXT_ESCAPES[ch] as string);
}

function toJsx(element: Element, depth: number, isRoot: boolean): string {
  const pad = "  ".repeat(depth);
  const attributes: string[] = [];
  for (const attribute of Array.from(element.attributes)) {
    const name = jsxAttributeName(attribute.name);
    if (name === null) continue;
    attributes.push(name === "style" ? `style=${styleObject(attribute.value)}` : `${name}=${jsxString(attribute.value)}`);
  }
  if (isRoot) attributes.push("{...props}");
  const open = `<${element.localName}${attributes.length ? ` ${attributes.join(" ")}` : ""}`;

  const children = Array.from(element.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? "").trim() !== ""));
  if (children.length === 0) return `${pad}${open} />`;

  if (children.every((node) => node.nodeType === 3)) {
    return `${pad}${open}>${jsxText(children.map((node) => (node.textContent ?? "").trim()).join(" "))}</${element.localName}>`;
  }
  const inner = children
    .map((node) => (node.nodeType === 1 ? toJsx(node as Element, depth + 1, false) : `${"  ".repeat(depth + 1)}${jsxText((node.textContent ?? "").trim())}`))
    .join("\n");
  return `${pad}${open}>\n${inner}\n${pad}</${element.localName}>`;
}

export function toReactComponent(svg: string, name: string): string {
  const root = parseSvg(svg);
  const component = componentNameFromIcon(name);
  return [
    'import type { SVGProps } from "react";',
    "",
    `export function ${component}(props: SVGProps<SVGSVGElement>) {`,
    "  return (",
    toJsx(root, 2, true),
    "  );",
    "}",
    "",
  ].join("\n");
}

const htmlAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const htmlText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toMarkup(element: Element, depth: number): string {
  const pad = "  ".repeat(depth);
  const attributes = Array.from(element.attributes).map((attribute) => `${attribute.name}="${htmlAttribute(attribute.value)}"`);
  const open = `<${element.localName}${attributes.length ? ` ${attributes.join(" ")}` : ""}`;
  const children = Array.from(element.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? "").trim() !== ""));
  if (children.length === 0) return `${pad}${open} />`;
  if (children.every((node) => node.nodeType === 3)) {
    return `${pad}${open}>${htmlText(children.map((node) => (node.textContent ?? "").trim()).join(" "))}</${element.localName}>`;
  }
  const inner = children.map((node) => (node.nodeType === 1 ? toMarkup(node as Element, depth + 1) : `${"  ".repeat(depth + 1)}${htmlText((node.textContent ?? "").trim())}`)).join("\n");
  return `${pad}${open}>\n${inner}\n${pad}</${element.localName}>`;
}

// A Vue 3 single-file component. Extra attributes (class, width, ...) fall through to the svg automatically.
export function toVueComponent(svg: string): string {
  return `<template>\n${toMarkup(parseSvg(svg), 1)}\n</template>\n`;
}
