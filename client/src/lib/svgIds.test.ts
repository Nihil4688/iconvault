import { describe, expect, it } from "vitest";
import { namespaceSvgIds } from "./svgIds";

describe("namespaceSvgIds", () => {
  it("leaves markup without ids untouched", () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M0 0h1v1z"/></svg>';
    expect(namespaceSvgIds(svg, "p1")).toBe(svg);
  });

  it("renames ids and every reference to them", () => {
    const svg =
      '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect/></clipPath><path id="p" d="M0 0h1v1z"/></defs>' +
      '<path fill="url(#g)" clip-path="url(#c)" d="M0 0"/><path style="fill:url(#g)" d="M1 1"/><use href="#p"/></svg>';
    const out = namespaceSvgIds(svg, "i7");
    expect(out).toContain('id="i7-g"');
    expect(out).toContain('fill="url(#i7-g)"');
    expect(out).toContain('clip-path="url(#i7-c)"');
    expect(out).toContain("fill:url(#i7-g)");
    expect(out).toContain('href="#i7-p"');
    expect(out).not.toMatch(/url\(#(g|c)\)|href="#p"/);
  });

  it("gives two icons that share an id different ids", () => {
    const svg = '<svg><defs><linearGradient id="a"/></defs><path fill="url(#a)"/></svg>';
    expect(namespaceSvgIds(svg, "x")).not.toBe(namespaceSvgIds(svg, "y"));
  });
});
