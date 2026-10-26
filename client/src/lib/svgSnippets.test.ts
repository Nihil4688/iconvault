// Tests for the code snippets generated from SVG markup. The React output is also run through the TypeScript compiler, because the point of the conversion is that it compiles as written.
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { componentNameFromIcon, toReactComponent, toVueComponent } from "./svgSnippets";

const SIMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function syntaxErrors(code: string): string[] {
  const result = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (result.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

describe("componentNameFromIcon", () => {
  it("makes a PascalCase name ending in Icon", () => {
    expect(componentNameFromIcon("Arrow Left")).toBe("ArrowLeftIcon");
    expect(componentNameFromIcon("arrow-left_2")).toBe("ArrowLeft2Icon");
    expect(componentNameFromIcon("home icon")).toBe("HomeIcon");
  });

  it("avoids names that start with a digit or are empty", () => {
    expect(componentNameFromIcon("24 hours")).toBe("Icon24HoursIcon");
    expect(componentNameFromIcon("!!!")).toBe("Icon");
    expect(componentNameFromIcon("")).toBe("Icon");
  });
});

describe("toReactComponent", () => {
  it("produces a typed component that spreads props on the svg", () => {
    const code = toReactComponent(SIMPLE, "Minus");
    expect(code).toContain('import type { SVGProps } from "react";');
    expect(code).toContain("export function MinusIcon(props: SVGProps<SVGSVGElement>) {");
    expect(code).toContain('<svg viewBox="0 0 24 24" fill="none" {...props}>');
    expect(code).toContain('<path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />');
    expect(code).not.toContain("xmlns");
  });

  it("compiles as written", () => {
    expect(syntaxErrors(toReactComponent(SIMPLE, "Minus"))).toEqual([]);
  });

  it("converts class, style, xlink and hyphenated attributes", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8">' +
      '<defs><path id="p" d="M0 0h1v1z" clip-rule="evenodd"/></defs>' +
      '<use xlink:href="#p" class="a b" style="fill:red;stroke-width:2;--tone:#333"/></svg>';
    const code = toReactComponent(svg, "Mixed");
    expect(code).toContain('className="a b"');
    expect(code).toContain('xlinkHref="#p"');
    expect(code).toContain('clipRule="evenodd"');
    expect(code).toContain('style={{ fill: "red", strokeWidth: "2", "--tone": "#333" }}');
    expect(code).not.toContain("xmlns");
    expect(code).not.toMatch(/\sclass=|stroke-width|clip-rule|xlink:/);
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("handles nesting, text, quotes, ampersands and braces", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g fill="url(#g)"><text x="1" y="1">a {b} &amp; c &lt; d</text></g>' +
      '<path d="M0 0" data-name="say &quot;hi&quot;"/></svg>';
    const code = toReactComponent(svg, "Tricky");
    expect(code).toContain('<g fill="url(#g)">');
    expect(code).toContain('{"{"}b{"}"}');
    expect(code).toContain("&amp;");
    expect(code).toContain("&lt;");
    expect(code).toContain('data-name="say &quot;hi&quot;"');
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("indents nested elements", () => {
    const code = toReactComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><g><path d="M0 0"/></g></svg>', "Nest");
    expect(code).toContain("    <svg viewBox=\"0 0 8 8\" {...props}>\n      <g>\n        <path d=\"M0 0\" />\n      </g>\n    </svg>");
  });

  it("refuses markup that is not an SVG", () => {
    expect(() => toReactComponent("<div/>", "x")).toThrow(/could not be read/);
    expect(() => toReactComponent("<svg><path></svg", "x")).toThrow(/could not be read/);
  });
});

describe("toVueComponent", () => {
  it("wraps the svg in a template and keeps attribute names", () => {
    const code = toVueComponent(SIMPLE);
    expect(code.startsWith("<template>\n  <svg ")).toBe(true);
    expect(code).toContain('stroke-width="2"');
    expect(code).toContain('<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />');
    expect(code.endsWith("  </svg>\n</template>\n")).toBe(true);
  });

  it("escapes quotes in attribute values", () => {
    const code = toVueComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0" data-x="a&quot;b"/></svg>');
    expect(code).toContain('data-x="a&quot;b"');
  });
});
