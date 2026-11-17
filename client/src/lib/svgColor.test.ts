import { describe, expect, it } from "vitest";
import { applySvgColor } from "./svgColor";

describe("applySvgColor", () => {
  it("recolours every fill of a multicolour icon", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:#283a5e" d="M0 0h1v1z"/><path style="fill:#ff4800" d="M2 2h1v1z"/></svg>';
    const out = applySvgColor(svg, "#3b82f6");
    expect(out).not.toMatch(/283a5e|ff4800/i);
    expect(out.match(/#3b82f6/g)).toHaveLength(2);
  });

  it("leaves the original untouched when no colour is chosen", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ff4800" d="M0 0h1v1z"/></svg>';
    expect(applySvgColor(svg, "")).toBe(svg);
  });

  it("keeps gradient fills", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(#g)" d="M0 0h1v1z"/></svg>';
    expect(applySvgColor(svg, "#3b82f6")).toBe(svg);
  });
});
