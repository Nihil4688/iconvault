import { describe, expect, it } from "vitest";
import { splitPastedSvgs } from "./pastedSvg";

describe("splitPastedSvgs", () => {
  it("splits adjacent SVG roots and reads names from direct title elements", () => {
    const result = splitPastedSvgs('<svg><title>Arrow</title><path d="M1 1"/></svg>\n<svg><path d="M2 2"/></svg>');

    expect(result).toHaveLength(2);
    expect(result?.map((svg) => svg.title)).toEqual(["Arrow", null]);
    expect(result?.[0].markup).toContain("<title>Arrow</title>");
  });

  it("keeps a nested SVG as part of its parent icon", () => {
    const result = splitPastedSvgs("<svg><g><svg><path/></svg></g></svg>");

    expect(result).toHaveLength(1);
  });

  it("rejects malformed markup and non-SVG roots", () => {
    expect(splitPastedSvgs("<svg><path></svg>")).toBeNull();
    expect(splitPastedSvgs("<div></div>")).toBeNull();
    expect(splitPastedSvgs("<svg></svg>extra")).toBeNull();
  });
});
