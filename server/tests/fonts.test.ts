// Unit tests for icon fonts: choosing codepoints, conversion warnings, reading names from a CSS or JSON map, and reading real fonts (TTF, WOFF, WOFF2, SVG font) that are built here with the same engine the server uses.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { unzipSync } from "fflate";
import { generateFonts, type FontAssetType } from "fantasticon";
import { conversionWarnings, planCodepoints, safeFontName, toHex, zipFontBuild } from "../src/services/fontService.js";
import { MAX_FONT_BYTES, parseMapping, privateUseOnly, readFontGlyphs } from "../src/services/fontImport.js";
import { buildFontSchema } from "../src/lib/validation.js";

const ids = (...list: string[]) => list.map((id) => ({ id, codepoint: null as string | null }));

describe("planCodepoints", () => {
  it("gives new icons the next free characters from the start, in order", () => {
    const plan = planCodepoints(ids("a", "b", "c"), "E001");
    assert.deepEqual([...plan.all].map(([id, n]) => [id, toHex(n)]), [["a", "E001"], ["b", "E002"], ["c", "E003"]]);
    assert.equal(plan.assigned.size, 3);
  });

  it("keeps existing codepoints and never hands them out again", () => {
    const plan = planCodepoints([{ id: "a", codepoint: "E002" }, ...ids("b", "c")], "E001");
    assert.equal(toHex(plan.all.get("a") as number), "E002");
    assert.equal(toHex(plan.all.get("b") as number), "E001");
    assert.equal(toHex(plan.all.get("c") as number), "E003");
    assert.equal(plan.assigned.has("a"), false);
  });

  it("reassigns every icon from the requested start when rebasing existing codepoints", () => {
    const plan = planCodepoints([{ id: "a", codepoint: "E001" }, { id: "b", codepoint: "E002" }], "E100", [], true);
    assert.deepEqual([...plan.all].map(([id, n]) => [id, toHex(n)]), [["a", "E100"], ["b", "E101"]]);
    assert.deepEqual([...plan.assigned].map(([id, n]) => [id, toHex(n)]), [["a", "E100"], ["b", "E101"]]);
  });

  it("does not take codepoints already used outside the rebased selection", () => {
    const plan = planCodepoints([{ id: "a", codepoint: "E001" }, { id: "b", codepoint: "E002" }], "E001", [0xe001], true);
    assert.deepEqual([...plan.all.values()].map(toHex), ["E002", "E003"]);
  });

  it("avoids codepoints used by icons outside the build", () => {
    const plan = planCodepoints(ids("a", "b"), "E001", [0xe001, 0xe002]);
    assert.deepEqual([...plan.all.values()].map(toHex), ["E003", "E004"]);
  });

  it("starts where asked and wraps around the end of the area", () => {
    const plan = planCodepoints(ids("a", "b", "c"), "F8FE");
    assert.deepEqual([...plan.all.values()].map(toHex), ["F8FE", "F8FF", "E000"]);
  });

  it("is stable: planning again with the saved codepoints changes nothing", () => {
    const first = planCodepoints(ids("a", "b"), "E010");
    const saved = [...first.all].map(([id, n]) => ({ id, codepoint: toHex(n) }));
    const second = planCodepoints(saved, "E200");
    assert.equal(second.assigned.size, 0);
    assert.deepEqual([...second.all], [...first.all]);
  });

  it("reports when the area is full", () => {
    const everything = Array.from({ length: 0xf8ff - 0xe000 + 1 }, (_, i) => 0xe000 + i);
    assert.throws(() => planCodepoints(ids("a"), "E001", everything), /no free characters/);
    const nearlyFull = everything.filter((n) => n !== 0xe555);
    assert.equal(toHex(planCodepoints(ids("a"), "E001", nearlyFull).all.get("a") as number), "E555");
  });
});

describe("small helpers", () => {
  it("warns about strokes, gradients and text only", () => {
    const warnings = conversionWarnings([
      { name: "Line", hasStroke: true, hasGradient: false, hasText: false },
      { name: "Fill", hasStroke: false, hasGradient: false, hasText: false },
      { name: "Both", hasStroke: false, hasGradient: true, hasText: true },
    ]);
    assert.deepEqual(warnings.map((w) => w.icon), ["Line", "Both", "Both"]);
    assert.match(warnings[0]?.message ?? "", /strokes/);
  });

  it("makes font names safe", () => {
    assert.equal(safeFontName("My Icons!"), "MyIcons");
    assert.equal(safeFontName("../../etc"), "etc");
    assert.equal(safeFontName("???"), "IconFont");
  });

  it("validates build options", () => {
    const ok = buildFontSchema.parse({});
    assert.deepEqual({ scope: ok.scope, formats: ok.formats, start: ok.startCodepoint, reassign: ok.reassignCodepoints, h: ok.fontHeight }, { scope: "all", formats: ["woff2", "woff", "ttf"], start: "E001", reassign: false, h: 1000 });
    assert.equal(buildFontSchema.parse({ startCodepoint: "e100" }).startCodepoint, "E100");
    for (const bad of [{ formats: [] }, { startCodepoint: "0041" }, { startCodepoint: "E0" }, { scope: "folder" }, { scope: "selected" }, { fontHeight: 10 }, { formats: ["pdf"] }, { surprise: 1 }, { prefix: "a b" }]) {
      assert.equal(buildFontSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});

describe("font ZIP layout", () => {
  it("packages font assets in the project folder structure, with an embedded stylesheet", () => {
    const buildFiles = [
      { name: "MetroStudio.ttf", data: Buffer.from("font-data") },
      { name: "MetroStudio.woff", data: Buffer.from("woff-data") },
      { name: "MetroStudio.css", data: Buffer.from('@font-face { font-family: "MetroStudio"; src: url("MetroStudio.woff2") format("woff2"), url("MetroStudio.ttf") format("truetype"); } i[class^="icon-"]:before, i[class*=" icon-"]:before { font-family: MetroStudio !important; } .icon-one:before { content: "\\e001"; }') },
      { name: "MetroStudio.scss", data: Buffer.from("$font: MetroStudio;") },
      { name: "MetroStudio.json", data: Buffer.from('{"one":57345}') },
      { name: "README.md", data: Buffer.from("Build notes") },
    ];
    const archive = unzipSync(zipFontBuild({
      fontName: "MetroStudio",
      prefix: "icon",
      iconCount: 1,
      warnings: [],
      baseClass: "",
      codepoints: [{ id: "one", name: "One", slug: "one", codepoint: "E001", className: "icon-one", isNew: false }],
      css: "",
      files: buildFiles,
      preview: { format: "woff2", base64: "" },
      sizes: {},
    }));

    assert.deepEqual(Object.keys(archive).sort(), [
      "Embed Font in CSS/demo.html",
      "Embed Font in CSS/style.css",
      "Fonts/MetroStudio.ttf",
      "Fonts/MetroStudio.woff",
      "demo.html",
      "library.json",
      "style.css",
    ]);
    assert.equal(Object.hasOwn(archive, "MetroStudio.ttf"), false);
    assert.equal(Buffer.from(archive["Fonts/MetroStudio.ttf"] ?? []).toString(), "font-data");
    assert.match(Buffer.from(archive["style.css"] ?? []).toString(), /Fonts\/MetroStudio\.ttf/);
    assert.doesNotMatch(Buffer.from(archive["style.css"] ?? []).toString(), /MetroStudio\.woff2/);
    assert.match(Buffer.from(archive["demo.html"] ?? []).toString(), /href="style\.css"/);
    const demo = Buffer.from(archive["demo.html"] ?? []).toString();
    assert.match(demo, /Font Name : MetroStudio/);
    assert.match(demo, /<i aria-hidden="true" class="icon-one icon"><\/i>/);
    assert.match(Buffer.from(archive["style.css"] ?? []).toString(), /i\[class\^="icon-"\]:before/);
    assert.match(demo, /<span class="valuetxt">one<\/span>/);
    assert.match(demo, /<span class="valuetxt">e001<\/span>/);
    assert.match(demo, /\.litile\s*\{\s*float:\s*left;\s*height:\s*150px;\s*width:\s*150px;/);
    assert.match(demo, /\.icon\s*\{[^}]*font-size:\s*40px;/);
    assert.match(Buffer.from(archive["Embed Font in CSS\/style.css"] ?? []).toString(), /url\("data:font\/ttf;base64,/);
    assert.equal(Buffer.from(archive["Embed Font in CSS\/demo.html"] ?? []).toString(), demo);
    assert.equal(Buffer.from(archive["library.json"] ?? []).toString(), '{"one":57345}');
  });
});

describe("parseMapping", () => {
  it("reads class names from CSS and drops common prefixes", () => {
    const map = parseMapping('.icon-heart:before { content: "\\e001"; } .fa-star::before{content:"\\F002";} .plain:before{content:\'\\e003\'}');
    assert.deepEqual([...map], [["e001", "heart"], ["f002", "star"], ["e003", "plain"]]);
  });

  it("reads a JSON glyph map with numbers or strings", () => {
    const map = parseMapping(JSON.stringify({ home: 57345, bell: "e002", gear: "\\e003", bad: "zzz" }));
    assert.equal(map.get("e001"), "home");
    assert.equal(map.get("e002"), "bell");
    assert.equal(map.get("e003"), "gear");
    assert.equal(map.size, 3);
  });

  it("returns an empty map for empty or unusable text", () => {
    assert.equal(parseMapping("").size, 0);
    assert.equal(parseMapping("hello").size, 0);
    assert.equal(parseMapping("{not json").size, 0);
  });
});

describe("reading real fonts", () => {
  let dir: string;
  const files: Record<string, Buffer> = {};
  const STAR = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fonttest-"));
    const inDir = path.join(dir, "in");
    const outDir = path.join(dir, "out");
    await mkdir(inDir);
    await mkdir(outDir);
    await writeFile(path.join(inDir, "star.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${STAR}"/></svg>`);
    await writeFile(path.join(inDir, "box.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>');
    await generateFonts({ inputDir: inDir, outputDir: outDir, name: "T", fontTypes: ["ttf", "woff", "woff2", "svg"] as FontAssetType[], assetTypes: ["css", "json"], codepoints: { star: 0xe001, box: 0xe002 }, prefix: "t", fontHeight: 1000, descent: 0, normalize: true });
    for (const ext of ["ttf", "woff", "woff2", "svg"]) files[ext] = await readFile(path.join(outDir, `T.${ext}`));
    files.css = await readFile(path.join(outDir, "T.css"));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  for (const [ext, kind] of [["ttf", "truetype"], ["woff", "woff"], ["woff2", "woff2"], ["svg", "svg"]] as const) {
    it(`reads a ${ext.toUpperCase()} font: kind, names, characters and outlines`, async () => {
      const read = await readFontGlyphs(files[ext] as Buffer);
      assert.equal(read.kind, kind);
      assert.equal(read.total, 2);
      assert.deepEqual(read.glyphs.map((g) => [g.name, g.codepoint]).sort(), [["box", "E002"], ["star", "E001"]]);
      for (const glyph of read.glyphs) {
        assert.match(glyph.svg, /^<svg [^>]*viewBox="0 0 \d+(\.\d+)? \d+(\.\d+)?"/);
        assert.match(glyph.svg, /<path d="[^"]+" fill="currentColor"/);
      }
    });
  }

  it("keeps all glyphs inside the picture: the box is as big as the font's em square", async () => {
    const read = await readFontGlyphs(files.ttf as Buffer);
    const box = read.glyphs.find((g) => g.name === "box") as { svg: string };
    assert.match(box.svg, /viewBox="0 0 1000 1000"/);
  });

  it("uses a mapping file to name glyphs", async () => {
    const css = '.pre-heart:before { content: "\\e001"; }';
    const read = await readFontGlyphs(files.ttf as Buffer, css);
    assert.deepEqual(read.glyphs.map((g) => g.name).sort(), ["box", "pre-heart"]);
  });

  it("recognises the font by its content, not its name, and keeps only Private Use glyphs when asked", async () => {
    const read = await readFontGlyphs(files.woff2 as Buffer);
    assert.equal(privateUseOnly(read.glyphs).length, 2);
    assert.equal(privateUseOnly([{ name: "a", svg: "", codepoint: "0041" }, { name: "b", svg: "", codepoint: null }]).length, 0);
  });

  it("refuses empty, oversized, damaged and unrelated files with a reason", async () => {
    await assert.rejects(readFontGlyphs(Buffer.alloc(0)), /empty/);
    await assert.rejects(readFontGlyphs(Buffer.alloc(MAX_FONT_BYTES + 1)), /larger than 8 MB/);
    await assert.rejects(readFontGlyphs(Buffer.from("PK\u0003\u0004 just a zip")), /not a font file/);
    await assert.rejects(readFontGlyphs(Buffer.from("wOF2 junk")), /WOFF2/);
    await assert.rejects(readFontGlyphs(Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.from("garbage garbage garbage")])), /could not be read/);
    await assert.rejects(readFontGlyphs(Buffer.from("<svg><font>")), /not well-formed|no glyphs|XML/i);
  });

  it("refuses a WOFF2 whose header announces a huge unpacked size, before unpacking it", async () => {
    const bomb = Buffer.alloc(64);
    bomb.write("wOF2", 0, "latin1");
    bomb.writeUInt32BE(0x7fffffff, 16);
    await assert.rejects(readFontGlyphs(bomb), /more than 24 MB/);
  });

  it("does not expand XML entities in an SVG font (no billion laughs)", async () => {
    const laughs = '<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><svg xmlns="http://www.w3.org/2000/svg"><defs><font><font-face units-per-em="1000"/><glyph unicode="&#xe001;" glyph-name="&c;" d="M0 0h10v10z"/></font></defs></svg>';
    const started = Date.now();
    try {
      const read = await readFontGlyphs(Buffer.from(laughs));
      assert.ok(read.glyphs.every((g) => g.name.length < 100), "entities must not be expanded");
    } catch (err) {
      assert.match((err as Error).message, /well-formed|font/i);
    }
    assert.ok(Date.now() - started < 2000);
  });

  it("skips glyphs that have no outline", async () => {
    const svgFont = '<svg xmlns="http://www.w3.org/2000/svg"><defs><font horiz-adv-x="1000"><font-face units-per-em="1000" ascent="800" descent="-200"/><glyph unicode="&#xe001;" glyph-name="space"/><glyph unicode="&#xe002;" glyph-name="dot" d="M0 0h100v100z"/></font></defs></svg>';
    const read = await readFontGlyphs(Buffer.from(svgFont));
    assert.deepEqual(read.glyphs.map((g) => g.name), ["dot"]);
    assert.match(read.glyphs[0]?.svg ?? "", /viewBox="0 0 1000 1000"/);
    assert.match(read.glyphs[0]?.svg ?? "", /scale\(1 -1\)/);
  });
});
