// Icon-font codepoints are exactly four hex digits between E000 and F8FF (the basic Private Use Area), so a glyph can never replace a real character and the font can hold it. Mirrors the server's rule (server/src/lib/codepoint.ts).

export function isFontCodepoint(hex: string): boolean {
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return false;
  const n = parseInt(hex, 16);
  return n >= 0xe000 && n <= 0xf8ff;
}

// An error message for what the user typed, or null when it is fine (blank is fine: it clears the codepoint).
export function codepointProblem(text: string): string | null {
  const value = text.trim();
  if (value === "") return null;
  if (!/^[0-9a-fA-F]{4}$/.test(value)) return "Use exactly 4 hex digits, for example E001.";
  if (!isFontCodepoint(value)) return "Use a value from E000 to F8FF so it cannot replace a real character.";
  return null;
}
