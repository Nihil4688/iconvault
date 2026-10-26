// Tests for loading the preview font and for the small helpers around it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { base64ToBytes, glyphChar, loadPreviewFont, nextPreviewFamily, unloadPreviewFont } from "./fontPreview";

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
});

describe("helpers", () => {
  it("gives every build its own family name", () => {
    expect(nextPreviewFamily()).not.toBe(nextPreviewFamily());
    expect(nextPreviewFamily()).toMatch(/^iconfont-preview-\d+$/);
  });

  it("decodes base64 to bytes", () => {
    expect([...base64ToBytes(btoa("wOF2"))]).toEqual([0x77, 0x4f, 0x46, 0x32]);
  });

  it("turns a codepoint into its character", () => {
    expect(glyphChar("E001")).toBe("");
    expect(glyphChar("f8ff")).toBe("");
    expect(glyphChar("zz")).toBe("");
  });
});

describe("loadPreviewFont", () => {
  it("adds the font to the page and reports success", async () => {
    const added: unknown[] = [];
    Object.defineProperty(document, "fonts", { value: { add: (f: unknown) => added.push(f), delete: vi.fn(), [Symbol.iterator]: () => [][Symbol.iterator]() }, configurable: true });
    const load = vi.fn().mockResolvedValue(undefined);
    const FontFaceMock = vi.fn(function (this: { family: string; load: typeof load }, family: string) {
      this.family = family;
      this.load = load;
    });
    vi.stubGlobal("FontFace", FontFaceMock);
    expect(await loadPreviewFont("fam", btoa("abc"))).toBe(true);
    expect(FontFaceMock).toHaveBeenCalledWith("fam", expect.any(ArrayBuffer));
    expect(added).toHaveLength(1);
  });

  it("registers a family only once, and reports it as ready when it already is", async () => {
    const added: unknown[] = [];
    const present: { family: string }[] = [];
    Object.defineProperty(document, "fonts", { value: { add: (f: { family: string }) => { added.push(f); present.push(f); }, delete: vi.fn(), [Symbol.iterator]: () => present[Symbol.iterator]() }, configurable: true });
    const FontFaceMock = vi.fn(function (this: { family: string; load: () => Promise<void> }, family: string) {
      this.family = family;
      this.load = () => Promise.resolve();
    });
    vi.stubGlobal("FontFace", FontFaceMock);
    expect(await loadPreviewFont("fam", btoa("abc"))).toBe(true);
    expect(await loadPreviewFont("fam", btoa("abc"))).toBe(true);
    expect(added).toHaveLength(1);
    expect(FontFaceMock).toHaveBeenCalledTimes(1);
    expect(await loadPreviewFont("other", btoa("abc"))).toBe(true);
    expect(added).toHaveLength(2);
  });

  it("reports false when the browser has no FontFace, or the font will not load", async () => {
    expect(await loadPreviewFont("fam", btoa("abc"))).toBe(false);
    Object.defineProperty(document, "fonts", { value: { add: vi.fn(), [Symbol.iterator]: () => [][Symbol.iterator]() }, configurable: true });
    vi.stubGlobal("FontFace", function () {
      return { load: () => Promise.reject(new Error("bad font")) };
    });
    expect(await loadPreviewFont("fam", btoa("abc"))).toBe(false);
  });

  it("removes a loaded font again", () => {
    const remove = vi.fn();
    const face = { family: "fam" };
    Object.defineProperty(document, "fonts", { value: { delete: remove, [Symbol.iterator]: () => [face][Symbol.iterator]() }, configurable: true });
    unloadPreviewFont("fam");
    expect(remove).toHaveBeenCalledWith(face);
  });
});
