// Tests for the optimizer, the combined pipeline, and the name/slug helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameFromFileName, slugify } from "../src/lib/slug.js";
import { optimizeSvg } from "../src/services/svgOptimizer.js";
import { prepareSvg } from "../src/services/svgPipeline.js";

const messy = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: some design tool -->
<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" version="1.1">
  <title>arrow</title>
  <desc>Created with a tool</desc>
  <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
    <g id="icon" fill="#000000" fill-rule="nonzero">
      <path d="M 12.000 4.000 L 10.590 5.410 L 16.170 11.000 L 4.000 11.000 L 4.000 13.000 L 16.170 13.000 L 10.590 18.590 L 12.000 20.000 L 20.000 12.000 Z" id="Path"></path>
    </g>
  </g>
</svg>`;

describe("optimizeSvg", () => {
  it("actually shrinks the file (guards against a silent no-op)", () => {
    const r = optimizeSvg(messy);
    assert.ok(r.optimizedSize < r.originalSize, `expected ${r.optimizedSize} < ${r.originalSize}`);
    assert.ok(r.savingsPercent > 10, `savings ${r.savingsPercent}%`);
    assert.equal(r.svg.length < messy.length, true);
  });

  it("keeps xmlns, viewBox and the drawing", () => {
    const r = optimizeSvg(messy);
    assert.match(r.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(r.svg, /viewBox="0 0 24 24"/);
    assert.match(r.svg, /<path/);
    // SVGO 4 keeps <title> (accessibility); comments and <desc> go. The sanitizer drops <title> in the full pipeline.
    assert.doesNotMatch(r.svg, /<desc|<!--/);
  });

  it("can drop width and height but keeps the viewBox", () => {
    const r = optimizeSvg(messy, { removeDimensions: true });
    assert.doesNotMatch(r.svg, /\swidth=|\sheight=/);
    assert.match(r.svg, /viewBox/);
  });

  it("keeps ids so internal references still work", () => {
    const withRef = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="grad-main"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect width="24" height="24" fill="url(#grad-main)"/></svg>';
    const r = optimizeSvg(withRef);
    assert.match(r.svg, /id="grad-main"/);
    assert.match(r.svg, /url\(#grad-main\)/);
  });

  it("keeps the original when the markup cannot be optimized", () => {
    const r = optimizeSvg("<svg><path></svg");
    assert.equal(r.svg, "<svg><path></svg");
    assert.equal(r.savingsPercent, 0);
  });
});

describe("prepareSvg", () => {
  it("cleans, optimizes and reports sizes and a fresh viewBox", () => {
    const r = prepareSvg(messy);
    assert.ok(r.byteSize < r.originalByteSize);
    assert.equal(r.byteSize, Buffer.byteLength(r.svg, "utf8"));
    assert.equal(r.viewBox, "0 0 24 24");
    assert.equal(r.width, 24, "size comes from the viewBox once width/height are removed");
    assert.equal(r.hasStroke, false);
  });

  it("recomputes flags from the final markup", () => {
    const r = prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0L9 9" stroke="#000" stroke-width="2"/></svg>');
    assert.equal(r.hasStroke, true);
  });

  it("can skip optimizing", () => {
    const r = prepareSvg(messy, { optimize: false });
    assert.equal(r.byteSize, r.originalByteSize);
    assert.match(r.svg, /Page-1/, "markup is only cleaned, not rewritten");
  });

  it("still rejects unsafe or invalid input", () => {
    assert.throws(() => prepareSvg("not svg"), /not an SVG/);
    const r = prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><script>x()</script><path d="M0 0h8v8z"/></svg>');
    assert.doesNotMatch(r.svg, /script/);
  });
});

describe("slug helpers", () => {
  it("turns file names into display names", () => {
    assert.equal(nameFromFileName("Arrow Left.svg"), "Arrow Left");
    assert.equal(nameFromFileName("icons/ui/arrow.SVG"), "arrow");
    assert.equal(nameFromFileName("  spaced   out .svg"), "spaced out");
    assert.equal(nameFromFileName(".svg"), "Icon");
    assert.equal(nameFromFileName("x".repeat(200) + ".svg").length, 100);
  });

  it("builds safe slugs", () => {
    assert.equal(slugify("Arrow Left!"), "arrow-left");
    assert.equal(slugify("  --Home__  "), "home");
    assert.equal(slugify("Café Crème"), "cafe-creme");
    assert.equal(slugify("icon_name-2"), "icon_name-2");
    assert.equal(slugify("日本語"), "icon");
    assert.equal(slugify(""), "icon");
    assert.equal(slugify("a".repeat(150)).length, 100);
    assert.match(slugify("Weird / name \\ with <chars>"), /^[a-z0-9_-]+$/);
  });
});
