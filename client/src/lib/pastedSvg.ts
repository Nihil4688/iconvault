const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type PastedSvg = {
  markup: string;
  title: string | null;
};

export function splitPastedSvgs(source: string): PastedSvg[] | null {
  const markup = source.replace(/^\uFEFF?\s*<\?xml[^?]*\?>/i, "");
  const document = new DOMParser().parseFromString(`<pasted-icons>${markup}</pasted-icons>`, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) return null;

  const root = document.documentElement;
  if (Array.from(root.childNodes).some((node) =>
    (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) && Boolean(node.textContent?.trim()),
  )) {
    return null;
  }

  const elements = Array.from(root.children);
  if (elements.length === 0 || elements.some((element) =>
    element.localName.toLowerCase() !== "svg" || (element.namespaceURI && element.namespaceURI !== SVG_NAMESPACE),
  )) {
    return null;
  }

  const serializer = new XMLSerializer();
  return elements.map((element) => {
    const title = Array.from(element.children).find((child) => child.localName.toLowerCase() === "title")?.textContent?.trim()
      || element.getAttribute("aria-label")?.trim()
      || null;
    return { markup: serializer.serializeToString(element), title };
  });
}
