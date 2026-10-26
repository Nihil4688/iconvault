// Icon-font codepoints must sit in a Unicode Private Use Area, so a glyph can never replace a real character such as "A".

// The three Private Use Areas: E000-F8FF (basic plane) and the two supplementary planes.
export function isPrivateUseCodepoint(hex: string): boolean {
  if (!/^[0-9a-fA-F]{4,6}$/.test(hex)) return false;
  const n = parseInt(hex, 16);
  return (n >= 0xe000 && n <= 0xf8ff) || (n >= 0xf0000 && n <= 0xffffd) || (n >= 0x100000 && n <= 0x10fffd);
}

// The characters an icon font here can hold: exactly four hex digits, E000 to F8FF (the basic-plane Private Use Area). The two supplementary planes are valid Unicode but cannot be written into the font's character map by the font engine (the glyph ends up on the wrong character), so they are not accepted for icons.
export function isFontCodepoint(hex: string): boolean {
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return false;
  const n = parseInt(hex, 16);
  return n >= 0xe000 && n <= 0xf8ff;
}
