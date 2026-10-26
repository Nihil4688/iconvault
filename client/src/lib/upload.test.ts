// Tests for upload rules, batching, merging results, and reading tags.
import { describe, expect, it } from "vitest";
import type { UploadSummary } from "../api/types";
import { BATCH_SIZE, MAX_FILE_BYTES, checkFiles, isSvgOrZip, mergeSummaries, parseTags, toBatches } from "./upload";

const file = (name: string, size = 10, lastModified = 1) => {
  const f = new File(["x".repeat(Math.min(size, 50))], name, { lastModified });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("checkFiles", () => {
  it("accepts SVG and ZIP files, whatever the letter case", () => {
    const { accepted, problems } = checkFiles([file("a.svg"), file("B.SVG"), file("pack.zip"), file("Pack2.ZIP")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.svg", "B.SVG", "pack.zip", "Pack2.ZIP"]);
    expect(problems).toEqual([]);
  });

  it("reports other types, empty files and files that are too large", () => {
    const { accepted, problems } = checkFiles([file("notes.txt"), file("empty.svg", 0), file("huge.svg", MAX_FILE_BYTES + 1), file("ok.svg")]);
    expect(accepted.map((f) => f.name)).toEqual(["ok.svg"]);
    expect(problems).toEqual([
      { file: "notes.txt", message: "Only .svg and .zip files can be added." },
      { file: "empty.svg", message: "The file is empty." },
      { file: "huge.svg", message: "Larger than 25 MB." },
    ]);
  });

  it("ignores the same file chosen twice but keeps same-named different files", () => {
    const { accepted } = checkFiles([file("a.svg", 10, 1), file("a.svg", 10, 1), file("a.svg", 20, 2)]);
    expect(accepted).toHaveLength(2);
  });

  it("recognises names", () => {
    expect(isSvgOrZip({ name: "x.svg" })).toBe(true);
    expect(isSvgOrZip({ name: "x.svg.txt" })).toBe(false);
    expect(isSvgOrZip({ name: "svg" })).toBe(false);
  });
});

describe("toBatches", () => {
  it("splits into batches of the given size", () => {
    expect(toBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(toBatches([], 2)).toEqual([]);
  });

  it("defaults to a batch size well under the server limit", () => {
    expect(BATCH_SIZE).toBeLessThanOrEqual(200);
    expect(toBatches(Array.from({ length: 250 }, (_, i) => i)).map((b) => b.length)).toEqual([100, 100, 50]);
  });
});

describe("mergeSummaries", () => {
  const summary = (over: Partial<UploadSummary>): UploadSummary => ({ created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0, ...over });
  it("adds up every part", () => {
    const merged = mergeSummaries([
      summary({ skipped: [{ name: "a", reason: "r" }], foldersCreated: 1 }),
      summary({ errors: [{ file: "b", message: "m" }], foldersCreated: 2 }),
    ]);
    expect(merged.skipped).toHaveLength(1);
    expect(merged.errors).toHaveLength(1);
    expect(merged.foldersCreated).toBe(3);
  });

  it("returns an empty summary for nothing", () => {
    expect(mergeSummaries([])).toEqual({ created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0 });
  });
});

describe("parseTags", () => {
  it("lower-cases, trims, removes blanks and repeats", () => {
    expect(parseTags(" UI, nav ,, ui ,Arrow")).toEqual(["ui", "nav", "arrow"]);
    expect(parseTags("")).toEqual([]);
  });

  it("limits the length and the number", () => {
    expect(parseTags("x".repeat(60))[0]).toHaveLength(40);
    expect(parseTags(Array.from({ length: 80 }, (_, i) => `t${i}`).join(","))).toHaveLength(50);
  });
});
