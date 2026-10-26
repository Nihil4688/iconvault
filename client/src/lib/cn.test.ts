// Tests for the class name helper.
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  // Conditions come from variables, as in real components.
  const off = [].length > 0;
  const on = [1].length > 0;

  it("joins names and drops falsy values", () => {
    expect(cn("a", off && "b", undefined, null, "c")).toBe("a c");
  });

  it("lets a later Tailwind class win over a conflicting earlier one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
    expect(cn("bg-primary", on && "bg-muted")).toBe("bg-muted");
  });

  it("accepts objects and arrays", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });
});
