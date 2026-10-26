// Unit tests for reading a project archive (no database) and for turning an icon into a sprite symbol.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import { ARCHIVE_FORMAT, readArchive } from "../src/services/projectArchive.js";
import { iconToSymbol } from "../src/services/spriteService.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1"/></svg>';
const manifest = (over: Record<string, unknown> = {}) => ({
  format: ARCHIVE_FORMAT,
  version: 1,
  project: { name: "P", description: "", prefix: "p", color: "#3b82f6", purpose: "sprite" },
  folders: [["UI"]],
  icons: [{ file: "icons/UI/home.svg", name: "Home", folder: ["UI"], tags: ["a"], codepoint: null }],
  ...over,
});
const zip = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

describe("readArchive", () => {
  it("reads a valid archive, filling defaults", () => {
    const { manifest: m, files } = readArchive(zip({ "project.json": JSON.stringify(manifest()), "icons/UI/home.svg": svg }));
    assert.equal(m.project.name, "P");
    assert.deepEqual(m.icons[0]?.folder, ["UI"]);
    assert.equal(files.get("icons/UI/home.svg")?.toString(), svg);
  });

  it("ignores files outside icons/, hidden junk and non-svg files", () => {
    const { files } = readArchive(zip({ "project.json": JSON.stringify(manifest()), "icons/UI/home.svg": svg, "icons/readme.txt": "x", "other/evil.svg": svg, "notes.md": "x" }));
    assert.deepEqual([...files.keys()], ["icons/UI/home.svg"]);
  });

  it("refuses what is not a project export, with a clear reason", () => {
    assert.throws(() => readArchive(Buffer.from("not a zip")), /not a valid ZIP/);
    assert.throws(() => readArchive(zip({ "icons/a.svg": svg })), /no project\.json/);
    assert.throws(() => readArchive(zip({ "project.json": "{nope" })), /not valid JSON/);
    assert.throws(() => readArchive(zip({ "project.json": JSON.stringify({ hello: 1 }) })), /not a supported export/);
    assert.throws(() => readArchive(zip({ "project.json": JSON.stringify(manifest({ version: 2 })) })), /not a supported export/);
  });

  it("validates the project settings and every icon entry", () => {
    const badPrefix = manifest({ project: { name: "P", description: "", prefix: "Bad Prefix!", color: "#3b82f6", purpose: "sprite" } });
    assert.throws(() => readArchive(zip({ "project.json": JSON.stringify(badPrefix) })), /project\.prefix/);
    const badIcon = manifest({ icons: [{ file: "icons/a.svg", name: "", folder: [], tags: [], codepoint: null }] });
    assert.throws(() => readArchive(zip({ "project.json": JSON.stringify(badIcon) })), /icons\.0\.name/);
    const badCodepoint = manifest({ icons: [{ file: "icons/a.svg", name: "A", folder: [], tags: [], codepoint: "0041" }] });
    assert.throws(() => readArchive(zip({ "project.json": JSON.stringify(badCodepoint) })), /codepoint/);
  });
});

describe("iconToSymbol", () => {
  it("keeps the viewBox and moves paint attributes onto a group", () => {
    const symbol = iconToSymbol('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" fill="none" stroke="currentColor"><path d="M1 1"/></svg>', "p-a");
    assert.equal(symbol, '<symbol id="p-a" viewBox="0 0 16 16"><g fill="none" stroke="currentColor"><path d="M1 1"/></g></symbol>');
  });

  it("falls back to width and height, then to 24 by 24", () => {
    assert.match(iconToSymbol('<svg width="10" height="20"><g/></svg>', "x") ?? "", /viewBox="0 0 10 20"/);
    assert.match(iconToSymbol("<svg><g/></svg>", "x") ?? "", /viewBox="0 0 24 24"/);
  });

  it("returns null for something that is not an svg", () => {
    assert.equal(iconToSymbol("nope", "x"), null);
  });
});
