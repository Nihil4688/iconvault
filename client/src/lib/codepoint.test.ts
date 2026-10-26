// Tests for the codepoint rule and the clipboard helper.
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";
import { codepointProblem, isFontCodepoint } from "./codepoint";

describe("codepoints", () => {
  it("accepts exactly four hex digits from E000 to F8FF", () => {
    for (const ok of ["E000", "e001", "F8FF", "E701"]) expect(isFontCodepoint(ok), ok).toBe(true);
    // Supplementary planes are valid Unicode but the font cannot hold them.
    for (const bad of ["0041", "DFFF", "F900", "F0000", "FFFFD", "100000", "10FFFD", "ZZZZ", "E0", "E0001", ""]) expect(isFontCodepoint(bad), bad).toBe(false);
  });

  it("explains what is wrong, and treats blank as clearing", () => {
    expect(codepointProblem("")).toBeNull();
    expect(codepointProblem("  ")).toBeNull();
    expect(codepointProblem("E001")).toBeNull();
    expect(codepointProblem("xyz")).toMatch(/4 hex digits/);
    expect(codepointProblem("E00001")).toMatch(/4 hex digits/);
    expect(codepointProblem("0041")).toMatch(/E000 to F8FF/);
    expect(codepointProblem("F0001")).toMatch(/4 hex digits/);
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("uses the clipboard API when there is one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to the older method when the API fails or is missing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("hello")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when nothing works", async () => {
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText("hello")).toBe(false);
  });
});
