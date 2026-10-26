// Tests for turning icons into a sprite and a sprite back into icons.
import { describe, expect, it } from "vitest";
import { DEFAULT_SPRITE_OPTIONS, buildSprite, formatSymbolId, idPatternProblem, prepareSvg, snippetFor, spriteToFiles, svgToSymbol, symbolId } from "./spriteBuild";

// jsdom files have no .text(), so read them the old way.
const readFile = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });

const svg = (body: string, attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe("svgToSymbol", () => {
  it("keeps the viewBox and moves root paint attributes onto a group", () => {
    const symbol = svgToSymbol(svg('<path d="M0 0h1"/>'), "fth-a");
    expect(symbol?.id).toBe("fth-a");
    expect(symbol?.viewBox).toBe("0 0 24 24");
    expect(symbol?.inner).toMatch(/^<g fill="none" stroke="currentColor"><path /);
    expect(symbol?.inner).toContain('d="M0 0h1"');
  });

  it("builds a viewBox from width and height, or 24 by 24", () => {
    expect(svgToSymbol(svg("<g/>", 'width="16" height="32"'), "x")?.viewBox).toBe("0 0 16 32");
    expect(svgToSymbol(svg("<g/>", ""), "x")?.viewBox).toBe("0 0 24 24");
  });

  it("returns null for something that is not an SVG", () => {
    expect(svgToSymbol("not svg", "x")).toBeNull();
    expect(svgToSymbol("<svg><", "x")).toBeNull();
  });
});

describe("buildSprite", () => {
  it("makes one symbol per icon, with the prefix, sorted by id", () => {
    const built = buildSprite(
      [
        { name: "Star", slug: "star", svg: svg("<path/>") },
        { name: "Home", slug: "home", svg: svg("<path/>") },
      ],
      "fth",
    );
    expect(built.ids).toEqual(["fth-home", "fth-star"]);
    expect(built.xml).toContain('<symbol id="fth-home" viewBox="0 0 24 24">');
    expect(built.xml).toContain('<symbol id="fth-star"');
    expect(built.skipped).toEqual([]);
  });

  it("reports icons it could not read and still builds the rest", () => {
    const built = buildSprite([{ name: "Bad", slug: "bad", svg: "nope" }, { name: "Ok", slug: "ok", svg: svg("<path/>") }], "p");
    expect(built.skipped).toEqual(["Bad"]);
    expect(built.ids).toEqual(["p-ok"]);
  });

  it("builds an empty sprite from no icons", () => {
    expect(buildSprite([], "p").ids).toEqual([]);
  });

  it("uses the id shown in the icon drawer", () => {
    expect(symbolId("feather", "arrow-right")).toBe("feather-arrow-right");
  });
});

describe("spriteToFiles", () => {
  const sprite = buildSprite([{ name: "Home", slug: "home", svg: svg('<path d="M1 1"/>') }, { name: "Star", slug: "star", svg: svg("<circle/>") }], "fth").xml;

  it("splits a sprite into one svg file per symbol and drops this project's prefix", async () => {
    const result = spriteToFiles(sprite, "fth");
    expect(result?.count).toBe(2);
    expect(result?.files.map((file) => file.name)).toEqual(["home.svg", "star.svg"]);
    const text = await readFile(result!.files[0]!);
    expect(text).toContain('viewBox="0 0 24 24"');
    expect(text).toContain('d="M1 1"');
    expect(text.startsWith("<svg")).toBe(true);
  });

  it("keeps the whole id when it does not start with the project prefix", () => {
    expect(spriteToFiles(sprite, "other")?.files.map((file) => file.name)).toEqual(["fth-home.svg", "fth-star.svg"]);
  });

  it("returns null for a plain icon or a broken document", () => {
    expect(spriteToFiles(svg("<path/>"), "fth")).toBeNull();
    expect(spriteToFiles("garbage", "fth")).toBeNull();
  });
});

describe("sprite options", () => {
  const colored = { name: "Home", slug: "home", svg: svg('<path fill="#ff0000" stroke="#00ff00" d="M0 0h1"/><circle fill="none" cx="1" cy="1" r="1"/>', 'viewBox="0 0 24 24"') };
  const gradient = { name: "Grad", slug: "grad", svg: svg('<defs><linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient><clipPath id="c"><rect width="4" height="4"/></clipPath></defs><path fill="url(#a)" clip-path="url(#c)" d="M0 0h4"/><use href="#a"/>', 'viewBox="0 0 24 24"') };

  it("defaults to a symbol sprite with {prefix}-{name} ids and no colour change", () => {
    const built = buildSprite([colored], "fth");
    expect(built.mode).toBe("symbol");
    expect(built.css).toBeNull();
    expect(built.ids).toEqual(["fth-home"]);
    expect(built.xml).toBe(built.symbolXml);
    expect(built.xml).toContain('fill="#ff0000"');
    expect(DEFAULT_SPRITE_OPTIONS.idPattern).toBe("{prefix}-{name}");
  });

  it("makes a stack sprite whose icons show only when targeted", () => {
    const built = buildSprite([colored], "fth", { ...DEFAULT_SPRITE_OPTIONS, mode: "stack" });
    expect(built.xml).toContain(":root > svg:target { display: inline; }");
    expect(built.xml).toContain('<svg id="fth-home" viewBox="0 0 24 24">');
    expect(built.xml).not.toContain("<symbol");
    // The preview always has symbols to draw.
    expect(built.symbolXml).toContain('<symbol id="fth-home"');
  });

  it("adds a companion stylesheet in the CSS mode", () => {
    const built = buildSprite([colored], "fth", { ...DEFAULT_SPRITE_OPTIONS, mode: "css" });
    expect(built.xml).toContain("<symbol");
    expect(built.css).toContain(".icon {");
    expect(built.css).toContain(".fth-home {");
  });

  it("builds ids from the pattern, and falls back to the default for a bad one", () => {
    expect(buildSprite([colored], "fth", { ...DEFAULT_SPRITE_OPTIONS, idPattern: "icon_{name}" }).ids).toEqual(["icon_home"]);
    expect(buildSprite([colored], "fth", { ...DEFAULT_SPRITE_OPTIONS, idPattern: "{prefix}-" }).ids).toEqual(["fth-home"]);
    expect(formatSymbolId("{prefix}__{name}", "a", "b")).toBe("a__b");
    expect(idPatternProblem("{prefix}-{name}")).toBeNull();
    expect(idPatternProblem("{prefix}")).toMatch(/must contain \{name\}/);
    expect(idPatternProblem("a b{name}")).toMatch(/Use only letters/);
  });

  it("turns colours into currentColor but leaves none and gradients alone", () => {
    const out = prepareSvg(colored.svg, "home", { stripColors: true, namespaceIds: false });
    expect(out).toContain('fill="currentColor"');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('fill="none"');
    expect(out).not.toContain("#ff0000");
    expect(prepareSvg(gradient.svg, "grad", { stripColors: true, namespaceIds: false })).toContain("url(#a)");
  });

  it("renames ids inside an icon and every reference to them", () => {
    const out = prepareSvg(gradient.svg, "grad", { stripColors: false, namespaceIds: true });
    expect(out).toContain('id="grad-a"');
    expect(out).toContain('id="grad-c"');
    expect(out).toContain("url(#grad-a)");
    expect(out).toContain("url(#grad-c)");
    expect(out).toContain('href="#grad-a"');
    expect(out).not.toContain('id="a"');
  });

  it("keeps two icons that use the same inner id apart", () => {
    const a = { name: "A", slug: "a", svg: svg('<defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0"/>', 'viewBox="0 0 24 24"') };
    const b = { name: "B", slug: "b", svg: svg('<defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M1 1"/>', 'viewBox="0 0 24 24"') };
    const built = buildSprite([a, b], "x");
    expect(built.xml).toContain('id="a-g"');
    expect(built.xml).toContain('id="b-g"');
    expect(buildSprite([a, b], "x", { ...DEFAULT_SPRITE_OPTIONS, namespaceIds: false }).xml.match(/id="g"/g)?.length).toBe(2);
  });

  it("gives the code that shows a symbol for each architecture", () => {
    expect(snippetFor("symbol", "fth-home")).toBe('<svg width="24" height="24"><use href="#fth-home"></use></svg>');
    expect(snippetFor("stack", "fth-home")).toBe('<img src="sprite.svg#fth-home" width="24" height="24" alt="">');
    expect(snippetFor("css", "fth-home", "icons.svg")).toBe('<svg class="icon"><use href="icons.svg#fth-home"></use></svg>');
  });
});
