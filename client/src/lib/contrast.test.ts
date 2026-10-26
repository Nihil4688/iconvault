// Reads the real colour tokens from index.css and checks WCAG contrast for every pair that carries text or a control boundary, in both themes. If someone edits a token and breaks readability, this fails.
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest does not return CSS for ?raw imports, so the stylesheet is read from disk. Tests run from the client folder (npm test).
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function block(selector: RegExp): Record<string, [number, number, number]> {
  const match = selector.exec(css);
  if (!match) throw new Error(`Block ${selector} not found in index.css`);
  const tokens: Record<string, [number, number, number]> = {};
  for (const [, name, h, s, l] of (match[1] as string).matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)) {
    tokens[name as string] = [Number(h), Number(s), Number(l)];
  }
  return tokens;
}

function luminance([h, s, l]: [number, number, number]): number {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(channel(0)) + 0.7152 * lin(channel(8)) + 0.0722 * lin(channel(4));
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  light: block(/:root\s*\{([^}]*--background[^}]*)\}/),
  dark: block(/\.dark\s*\{([^}]*)\}/),
};

// Text on its surface must reach 4.5:1 (WCAG AA).
const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary", "card"],
  ["destructive", "background"],
  ["destructive", "card"],
];

// Control boundaries and the focus ring must reach 3:1 (WCAG 1.4.11).
const UI_PAIRS: Array<[string, string]> = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
];

describe.each(Object.entries(themes))("%s theme tokens", (_name, tokens) => {
  it("defines every token the pairs use", () => {
    for (const [a, b] of [...TEXT_PAIRS, ...UI_PAIRS]) {
      expect(tokens[a], a).toBeDefined();
      expect(tokens[b], b).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)("text %s on %s reaches 4.5:1", (fg, bg) => {
    const ratio = contrast(tokens[fg] as [number, number, number], tokens[bg] as [number, number, number]);
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("%s against %s reaches 3:1", (fg, bg) => {
    const ratio = contrast(tokens[fg] as [number, number, number], tokens[bg] as [number, number, number]);
    expect(ratio, `${fg} against ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});
