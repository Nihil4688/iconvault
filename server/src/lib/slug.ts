// Turns file names into display names and URL/CSS-friendly slugs.

const MAX_LENGTH = 100;

// "Arrow Left.svg" -> "Arrow Left". Falls back to "Icon" for an empty result.
export function nameFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const name = base.replace(/\.svg$/i, "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH).trim();
  return name || "Icon";
}

// "Arrow Left!" -> "arrow-left". Letters with accents lose the accent. Falls back to "icon".
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/[-_]+$/g, "");
  return slug || "icon";
}
