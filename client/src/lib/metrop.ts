const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function metropToFiles(text: string): File[] {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const root = document.documentElement;
  if (document.doctype || document.getElementsByTagName("parsererror").length > 0 || root.localName !== "IconProject") {
    throw new Error("The .metrop file could not be read.");
  }

  const icons = Array.from(root.children).filter((element) => element.localName === "Icon");
  if (icons.length === 0) throw new Error("The .metrop file does not contain any icons.");

  return icons.map((icon, index) => {
    const name = icon.getAttribute("Name")?.trim();
    const data = icon.getAttribute("Data")?.trim();
    if (!name || !data || !/^[Mm]/.test(data)) {
      throw new Error("The .metrop file does not contain valid icon data.");
    }

    const svgDocument = document.implementation.createDocument(SVG_NAMESPACE, "svg");
    const svg = svgDocument.documentElement;
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = svgDocument.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", data);
    svg.append(path);

    const fileName = name
      .replace(/[<>:"/\\|?*]/g, "-")
      .replace(/[. ]+$/, "") || `icon-${index + 1}`;
    return new File([new XMLSerializer().serializeToString(svg)], `${fileName}.svg`, { type: "image/svg+xml" });
  });
}
