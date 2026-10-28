import { describe, expect, it } from "vitest";
import { metropToFiles } from "./metrop";
import { readFileText } from "./readFile";

describe("metropToFiles", () => {
  it("converts METROP icon paths to standalone SVG files", async () => {
    const files = metropToFiles('<IconProject Version="2.0"><Icon Name="Arrow Left" Data="M1 2L3 4z" /></IconProject>');

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("Arrow Left.svg");
    const svg = new DOMParser().parseFromString(await readFileText(files[0]), "image/svg+xml");
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M1 2L3 4z");
  });

  it("keeps path data as an SVG attribute instead of interpreting it as markup", async () => {
    const files = metropToFiles('<IconProject><Icon Name="safe" Data="M1 2L3 4&amp;5" /></IconProject>');
    const svg = new DOMParser().parseFromString(await readFileText(files[0]), "image/svg+xml");

    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M1 2L3 4&5");
  });

  it("rejects malformed or unsupported METROP documents", () => {
    expect(() => metropToFiles("<IconProject>")).toThrow("could not be read");
    expect(() => metropToFiles("<OtherProject />")).toThrow("could not be read");
    expect(() => metropToFiles("<IconProject />")).toThrow("does not contain any icons");
    expect(() => metropToFiles('<IconProject><Icon Name="missing path" /></IconProject>')).toThrow("does not contain valid icon data");
  });
});
