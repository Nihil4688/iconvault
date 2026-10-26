// Tests for the SVG sanitizer: what must be removed, what must survive, and how size and flags are read.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SVG_BYTES, inspectSvg, sanitizeSvg } from "../src/services/svgSanitizer.js";

const wrap = (inner: string, attrs = 'viewBox="0 0 24 24"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe("sanitizeSvg: removes dangerous content", () => {
  it("removes <script> elements", () => {
    const { svg } = sanitizeSvg(wrap('<script>alert(1)</script><path d="M0 0h1v1z"/>'));
    assert.doesNotMatch(svg, /script|alert/i);
    assert.match(svg, /<path/);
  });

  it("removes event handler attributes", () => {
    const { svg } = sanitizeSvg(wrap('<path d="M0 0h1v1z" onclick="alert(1)" onmouseover="x()"/>', 'viewBox="0 0 24 24" onload="alert(2)"'));
    assert.doesNotMatch(svg, /onclick|onload|onmouseover|alert/i);
  });

  it("removes foreignObject, images, iframes and filters", () => {
    const { svg } = sanitizeSvg(
      wrap(
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>' +
          '<image href="https://evil.example/x.png"/><iframe src="https://evil.example"/>' +
          '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter><path d="M0 0h1v1z"/>',
      ),
    );
    assert.doesNotMatch(svg, /foreignObject|<image|iframe|<filter|feGaussian|evil/i);
    assert.match(svg, /<path/);
  });

  it("removes external, javascript: and data: links but keeps in-document ones", () => {
    const { svg } = sanitizeSvg(
      wrap(
        '<defs><path id="p" d="M0 0h1v1z"/></defs>' +
          '<use href="https://evil.example/s.svg#a"/><use xlink:href="//evil.example/s.svg#a" xmlns:xlink="http://www.w3.org/1999/xlink"/>' +
          '<use href="javascript:alert(1)"/><use href="data:image/svg+xml;base64,AAAA"/><use href="#p"/>',
      ),
    );
    assert.doesNotMatch(svg, /evil|javascript|data:/i);
    assert.match(svg, /href="#p"/);
  });

  it("removes external url() references in attributes and styles", () => {
    const { svg } = sanitizeSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
          '<rect width="5" height="5" fill="url(https://evil.example/x#a)"/>' +
          '<rect width="5" height="5" style="fill:url(//evil.example/y);stroke:blue"/>' +
          '<rect width="5" height="5" fill="url(#g)"/>',
      ),
    );
    assert.doesNotMatch(svg, /evil/i);
    assert.match(svg, /fill="url\(#g\)"/, "in-document references stay");
    assert.match(svg, /stroke:blue/, "harmless declarations in the same style stay");
  });

  it("drops dangerous style declarations", () => {
    const { svg } = sanitizeSvg(wrap('<path d="M0 0h1v1z" style="fill:red;behavior:url(x.htc);width:expression(alert(1))"/>'));
    assert.doesNotMatch(svg, /behavior|expression|alert/i);
    assert.match(svg, /fill:red/);
  });

  it("rejects XML entity declarations", () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>';
    assert.throws(() => sanitizeSvg(xxe), /entit/i);
  });

  it("rejects content that is not an SVG", () => {
    assert.throws(() => sanitizeSvg("<html><body>hello</body></html>"), /not an SVG/i);
    assert.throws(() => sanitizeSvg("just text"), /not an SVG/i);
    assert.throws(() => sanitizeSvg(""), /not an SVG/i);
  });

  it("rejects markup that is not well-formed XML instead of repairing it", () => {
    for (const broken of ["<svg><path", "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0\"></svg>", "<svg>&nbsp;</svg>", "<html><body><svg xmlns=\"http://www.w3.org/2000/svg\"></svg></body></html>"]) {
      assert.throws(() => sanitizeSvg(broken), /not an SVG|could not be parsed/i, broken);
    }
  });

  it("rejects markup that is too large", () => {
    const big = wrap(`<path d="${"M0 0h1v1z".repeat(MAX_SVG_BYTES / 8)}"/>`);
    assert.throws(() => sanitizeSvg(big), /larger than 1 MB/);
  });
});

describe("sanitizeSvg: keeps what icons need", () => {
  it("keeps shapes, paint, gradients and clip paths", () => {
    const { svg } = sanitizeSvg(
      wrap(
        '<defs><clipPath id="c"><rect width="10" height="10"/></clipPath>' +
          '<linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>' +
          '<g clip-path="url(#c)" fill="url(#g)"><circle cx="5" cy="5" r="4"/><path d="M1 1L9 9" stroke="#000" stroke-width="2" stroke-linecap="round" clip-rule="evenodd"/></g>',
      ),
    );
    for (const part of ["clipPath", "linearGradient", "<stop", "<circle", "stroke-linecap", "clip-rule", 'clip-path="url(#c)"', 'fill="url(#g)"']) {
      assert.ok(svg.includes(part), `expected ${part} to survive`);
    }
  });

  it("keeps colours that came from a <style> block by inlining them first", () => {
    const { svg } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.a{fill:#ff0000}</style><path class="a" d="M0 0h10v10H0z"/></svg>',
    );
    assert.doesNotMatch(svg, /<style/i);
    assert.match(svg, /ff0000|#f00|red/i, "the colour must not be lost");
  });

  it("adds xmlns and a viewBox when they are missing", () => {
    const { svg, viewBox, width, height } = sanitizeSvg('<svg width="32" height="16"><path d="M0 0h1v1z"/></svg>');
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.equal(viewBox, "0 0 32 16");
    assert.match(svg, /viewBox="0 0 32 16"/);
    assert.equal(width, 32);
    assert.equal(height, 16);
  });

  it("accepts a BOM, an XML declaration and surrounding whitespace", () => {
    const { svg } = sanitizeSvg(`﻿  <?xml version="1.0" encoding="UTF-8"?>\n${wrap('<path d="M0 0h1v1z"/>')}\n`);
    assert.match(svg, /^<svg/);
  });
});

describe("sanitizeSvg: size and flags", () => {
  it("reads size from width and height, ignoring px", () => {
    const r = sanitizeSvg(wrap('<path d="M0 0h1v1z"/>', 'width="48px" height="40" viewBox="0 0 24 24"'));
    assert.equal(r.width, 48);
    assert.equal(r.height, 40);
    assert.equal(r.viewBox, "0 0 24 24");
  });

  it("falls back to the viewBox when width and height are percentages or missing", () => {
    const r = sanitizeSvg(wrap('<path d="M0 0h1v1z"/>', 'width="100%" height="100%" viewBox="0 0 20 30"'));
    assert.equal(r.width, 20);
    assert.equal(r.height, 30);
    const none = sanitizeSvg(wrap('<path d="M0 0h1v1z"/>', 'viewBox="0 0 16 16"'));
    assert.equal(none.width, 16);
  });

  it("flags strokes from attributes and from style, but not stroke-width alone", () => {
    assert.equal(sanitizeSvg(wrap('<path d="M0 0h1v1z" stroke="#000"/>')).hasStroke, true);
    assert.equal(sanitizeSvg(wrap('<path d="M0 0h1v1z" style="stroke:#000"/>')).hasStroke, true);
    assert.equal(sanitizeSvg(wrap('<path d="M0 0h1v1z" stroke="none"/>')).hasStroke, false);
    assert.equal(sanitizeSvg(wrap('<path d="M0 0h1v1z" style="stroke-width:2;fill:red"/>')).hasStroke, false);
    assert.equal(sanitizeSvg(wrap('<path d="M0 0h1v1z" fill="red"/>')).hasStroke, false);
  });

  it("flags gradients and text, and explains them in warnings", () => {
    const r = sanitizeSvg(wrap('<defs><radialGradient id="r"><stop offset="0"/></radialGradient></defs><text x="1" y="1">A</text>'));
    assert.equal(r.hasGradient, true);
    assert.equal(r.hasText, true);
    assert.equal(r.hasStroke, false);
    assert.equal(r.warnings.length, 2);
    assert.deepEqual(sanitizeSvg(wrap('<path d="M0 0h1v1z"/>')).warnings, []);
  });
});

describe("inspectSvg", () => {
  it("reads a clean document and rejects broken markup", () => {
    assert.equal(inspectSvg(wrap('<path d="M0 0h1v1z" stroke="red"/>')).hasStroke, true);
    assert.throws(() => inspectSvg("<svg><path></svg"), /could not be parsed/);
    assert.throws(() => inspectSvg("<div/>"), /could not be parsed/);
  });
});

describe("sanitizeSvg: shape limits and style properties", () => {
  it("removes style properties that could move an icon out of its box", () => {
    const { svg } = sanitizeSvg(wrap('<path d="M0 0h1v1z" style="fill:red;position:fixed;top:0;left:0;z-index:9999;pointer-events:none;filter:blur(2px)"/>'));
    assert.match(svg, /fill:red/);
    assert.doesNotMatch(svg, /position|z-index|top:|left:|pointer-events|filter/i);
  });

  it("refuses more than 5000 elements", () => {
    assert.throws(() => sanitizeSvg(wrap('<path d="M0 0h1v1z"/>'.repeat(5001))), /more than 5000 elements/);
    assert.doesNotThrow(() => sanitizeSvg(wrap('<path d="M0 0h1v1z"/>'.repeat(200))));
  });

  it("refuses elements nested too deeply", () => {
    const deep = "<g>".repeat(40) + '<path d="M0 0h1v1z"/>' + "</g>".repeat(40);
    assert.throws(() => sanitizeSvg(wrap(deep)), /nested more than 32/);
    const fine = "<g>".repeat(10) + '<path d="M0 0h1v1z"/>' + "</g>".repeat(10);
    assert.doesNotThrow(() => sanitizeSvg(wrap(fine)));
  });

  it("refuses <use> chains that multiply", () => {
    let defs = '<g id="l0"><path d="M0 0h1v1z"/></g>';
    for (let i = 1; i <= 12; i += 1) defs += `<g id="l${i}"><use href="#l${i - 1}"/><use href="#l${i - 1}"/><use href="#l${i - 1}"/><use href="#l${i - 1}"/></g>`;
    assert.throws(() => sanitizeSvg(wrap(`<defs>${defs}</defs><use href="#l12"/>`)), /too many repeated <use>/);
  });

  it("refuses an element that uses itself, and still accepts an ordinary <use>", () => {
    assert.throws(() => sanitizeSvg(wrap('<g id="a"><use href="#a"/></g>')), /uses itself/);
    assert.doesNotThrow(() => sanitizeSvg(wrap('<defs><path id="p" d="M0 0h1v1z"/></defs><use href="#p"/><use href="#p" x="5"/>')));
  });
});
