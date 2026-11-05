function recolorDeclarations(stylesheet: string, color: string): string {
  return stylesheet.replace(/(^|[;{]\s*|\s+)(fill|stroke)(\s*:\s*)([^;}]+)/gi, (declaration, prefix: string, property: string, separator: string, value: string) => {
    const important = /\s*!important\s*$/i.test(value) ? " !important" : "";
    const currentValue = value.replace(/\s*!important\s*$/i, "").trim();
    return currentValue.toLowerCase() === "none" ? declaration : `${prefix}${property}${separator}${color}${important}`;
  });
}

function hasMultiplePaintColors(root: Element): boolean {
  const colors = new Set<string>();
  const inspectPaint = (value: string | null): boolean => {
    if (!value) return false;
    const paint = value.replace(/\s*!important\s*$/i, "").trim().toLowerCase();
    if (paint.startsWith("url(")) return true;
    if (!["none", "currentcolor", "inherit", "initial", "unset"].includes(paint) && !paint.startsWith("var(")) {
      colors.add(paint);
    }
    return colors.size > 1;
  };
  const inspectDeclarations = (declarations: string): boolean => {
    const paintPattern = /(?:^|[;{]\s*|\s+)(?:fill|stroke)\s*:\s*([^;}]+)/gi;
    for (const match of declarations.matchAll(paintPattern)) {
      if (inspectPaint(match[1] ?? null)) return true;
    }
    return false;
  };

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (inspectPaint(element.getAttribute("fill")) || inspectPaint(element.getAttribute("stroke"))) return true;
    if (inspectDeclarations(element.getAttribute("style") ?? "")) return true;
    if (element.localName === "style" && inspectDeclarations(element.textContent ?? "")) return true;
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

  if (hasMultiplePaintColors(root)) return svg;

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
