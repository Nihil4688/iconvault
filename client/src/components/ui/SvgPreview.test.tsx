import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SvgPreview from "./SvgPreview";

describe("SvgPreview", () => {
  it("applies a selected colour to explicit SVG fill and stroke values", () => {
    const svg = '<svg viewBox="0 0 24 24"><path fill="#f00" stroke="#00f" d="M1 1h10v10z"/></svg>';

    const { container } = render(<SvgPreview svg={svg} color="#3b82f6" />);
    const path = container.querySelector("path");

    expect(path).toHaveAttribute("fill", "#3b82f6");
    expect(path).toHaveAttribute("stroke", "#3b82f6");
  });

  it("recolours fills and strokes in inline and stylesheet rules but keeps none transparent", () => {
    const svg = '<svg viewBox="0 0 24 24"><style>.shape { fill: #f00; stroke: #00f; }</style><path class="shape" style="fill: #0f0; stroke: #ff0" d="M1 1h10v10z"/><path fill="none" stroke="none" d="M2 2h5"/></svg>';

    const { container } = render(<SvgPreview svg={svg} color="#3b82f6" />);
    const paths = container.querySelectorAll("path");

    expect(paths[0]).toHaveStyle({ fill: "#3b82f6", stroke: "#3b82f6" });
    expect(paths[1]).toHaveAttribute("fill", "none");
    expect(paths[1]).toHaveAttribute("stroke", "none");
    expect(container.querySelector("style")?.textContent).toContain("fill: #3b82f6");
    expect(container.querySelector("style")?.textContent).toContain("stroke: #3b82f6");
  });

  it("recolours inherited root strokes without turning a no-fill icon into a filled one", () => {
    const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#f00"><path d="M1 1h10v10z"/></svg>';

    const { container } = render(<SvgPreview svg={svg} color="#3b82f6" />);
    const root = container.querySelector("svg");

    expect(root).toHaveAttribute("fill", "none");
    expect(root).toHaveAttribute("stroke", "#3b82f6");
  });

  it("preserves uploaded colors when no preview colour is selected", () => {
    const svg = '<svg viewBox="0 0 24 24"><path fill="#f00" d="M1 1h10v10z"/></svg>';

    const { container } = render(<SvgPreview svg={svg} />);

    expect(container.querySelector("path")).toHaveAttribute("fill", "#f00");
  });
});
