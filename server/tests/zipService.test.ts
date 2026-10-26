// Unit tests for reading SVGs from a ZIP (limits, ignored entries, folder paths) and for the codepoint rule.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { isFontCodepoint, isPrivateUseCodepoint } from "../src/lib/codepoint.js";
import { ZIP_LIMITS, buildZip, readSvgsFromZip } from "../src/services/zipService.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h1v1z"/></svg>';
const zip = (files: Record<string, string>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))));

describe("readSvgsFromZip", () => {
  it("returns SVGs with their folder paths, sorted", () => {
    const { entries, skipped } = readSvgsFromZip(zip({ "UI/Arrows/left.svg": svg, "UI/right.svg": svg, "top.SVG": svg }));
    assert.deepEqual(entries.map((e) => [e.folders, e.fileName]), [
      [[], "top.SVG"],
      [["UI", "Arrows"], "left.svg"],
      [["UI"], "right.svg"],
    ]);
    assert.deepEqual(skipped, []);
    assert.equal(entries[0]?.data.toString("utf8"), svg);
  });

  it("ignores directories, other file types, hidden files and macOS metadata", () => {
    const { entries } = readSvgsFromZip(
      zip({ "readme.txt": "hi", "a.png": "x", ".hidden/x.svg": svg, "UI/._left.svg": svg, "__MACOSX/UI/left.svg": svg, "ok.svg": svg }),
    );
    assert.deepEqual(entries.map((e) => e.fileName), ["ok.svg"]);
  });

  it("caps the number of SVG files and reports the rest", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < ZIP_LIMITS.maxSvgFiles + 3; i += 1) files[`f${String(i).padStart(4, "0")}.svg`] = svg;
    const { entries, skipped } = readSvgsFromZip(zip(files));
    assert.equal(entries.length, ZIP_LIMITS.maxSvgFiles);
    assert.equal(skipped.length, 3);
    assert.match(skipped[0]?.reason ?? "", /more than 500/);
  });

  it("skips a file that is too large", () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg">${"<g/>".repeat(ZIP_LIMITS.maxEntryBytes / 4 + 10)}</svg>`;
    const { entries, skipped } = readSvgsFromZip(zip({ "big.svg": big, "small.svg": svg }));
    assert.deepEqual(entries.map((e) => e.fileName), ["small.svg"]);
    assert.equal(skipped[0]?.path, "big.svg");
  });

  it("rejects data that is not a ZIP", () => {
    assert.throws(() => readSvgsFromZip(Buffer.from("this is not a zip file at all")), /not a valid ZIP/);
  });
});

describe("buildZip", () => {
  it("round-trips file contents", () => {
    const out = unzipSync(new Uint8Array(buildZip([{ name: "a.svg", content: svg }, { name: "b.svg", content: "<svg/>" }])));
    assert.equal(Buffer.from(out["a.svg"] as Uint8Array).toString(), svg);
    assert.deepEqual(Object.keys(out).sort(), ["a.svg", "b.svg"]);
  });
});

describe("isPrivateUseCodepoint", () => {
  it("accepts the Private Use Areas only", () => {
    for (const ok of ["E000", "e001", "F8FF", "F0000", "FFFFD", "100000", "10FFFD"]) assert.equal(isPrivateUseCodepoint(ok), true, ok);
    for (const bad of ["0041", "DFFF", "F900", "FFFFE", "10FFFE", "110000", "ZZZZ", "E0", "", "E00000A"]) assert.equal(isPrivateUseCodepoint(bad), false, bad);
  });
});

describe("isFontCodepoint", () => {
  it("accepts exactly four hex digits from E000 to F8FF, because the font cannot hold anything else", () => {
    for (const ok of ["E000", "e001", "F8FF", "E701"]) assert.equal(isFontCodepoint(ok), true, ok);
    for (const bad of ["0041", "DFFF", "F900", "F0000", "FFFFD", "100000", "10FFFD", "E0", "E0001", "ZZZZ", ""]) assert.equal(isFontCodepoint(bad), false, bad);
  });
});
