// Loads a built font into the page so its glyphs can be shown. Each build gets its own font family name, so a rebuilt font never shows a stale cached one. Browsers without the FontFace API simply show no glyphs (the names and codes are still listed).

let counter = 0;

export function nextPreviewFamily(): string {
  counter += 1;
  return `iconfont-preview-${counter}`;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isRegistered(family: string): boolean {
  return [...document.fonts].some((face) => face.family === family || face.family === `"${family}"`);
}

// Resolves to true when the font is ready to draw with. Registering the same family twice does nothing the second time, so a screen can safely make sure a font is there.
export async function loadPreviewFont(family: string, base64: string): Promise<boolean> {
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return false;
  if (isRegistered(family)) return true;
  try {
    const face = new FontFace(family, base64ToBytes(base64).buffer as ArrayBuffer);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}

export function unloadPreviewFont(family: string): void {
  if (typeof document === "undefined" || !document.fonts) return;
  for (const face of [...document.fonts]) if (face.family === family || face.family === `"${family}"`) document.fonts.delete(face);
}

// The character a codepoint such as "E001" stands for.
export function glyphChar(codepoint: string): string {
  const n = parseInt(codepoint, 16);
  return Number.isFinite(n) ? String.fromCodePoint(n) : "";
}
