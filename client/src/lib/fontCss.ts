export function embeddedFontCss(css: string, fontBase64: string): string {
  if (!fontBase64) throw new Error("The preview font is unavailable, so the stylesheet cannot be embedded.");

  let replacedSource = false;
  const result = css.replace(/src\s*:[^;]*;/i, () => {
    replacedSource = true;
    return `src: url("data:font/woff2;base64,${fontBase64}") format("woff2");`;
  });
  if (!replacedSource) throw new Error("The font stylesheet has no @font-face source to embed.");
  return result;
}
