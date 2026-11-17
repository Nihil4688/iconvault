function recolorDeclarations(stylesheet: string, color: string): string {
  return stylesheet.replace(/(^|[;{]\s*|\s+)(fill|stroke)(\s*:\s*)([^;}]+)/gi, (declaration, prefix: string, property: string, separator: string, value: string) => {
    const important = /\s*!important\s*$/i.test(value) ? " !important" : "";
    const currentValue = value.replace(/\s*!important\s*$/i, "").trim();
    return currentValue.toLowerCase() === "none" ? declaration : `${prefix}${property}${separator}${color}${important}`;
  });
}

// Gradients and patterns (paint servers) are left alone: a flat colour would destroy them.
function hasPaintServer(root: Element): boolean {
  const isServer = (value: string | null) => !!value && /url\(/i.test(value);
  const inDeclarations = (declarations: string) => /(?:^|[;{\s])(?:fill|stroke)\s*:\s*url\(/i.test(declarations);
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (isServer(element.getAttribute("fill")) || isServer(element.getAttribute("stroke"))) return true;
    if (inDeclarations(element.getAttribute("style") ?? "")) return true;
    if (element.localName === "style" && inDeclarations(element.textContent ?? "")) return true;
  }
  return false;
}

export function applySvgColor(svg: string, color: string): string {
  if (!color) return svg;

  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror")) {
    throw new Error("The SVG could not be recoloured.");
  }

  if (hasPaintServer(root)) return svg;

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of ["fill", "stroke"]) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim().toLowerCase() !== "none") {
        element.setAttribute(attribute, color);
      }
    }

    const inlineStyle = element.getAttribute("style");
    if (inlineStyle) {
      element.setAttribute("style", recolorDeclarations(inlineStyle, color));
    }

    if (element.localName === "style") {
      element.textContent = recolorDeclarations(element.textContent ?? "", color);
    }
  }

  return new XMLSerializer().serializeToString(root);
}
