// Tests for the project form rules and the accent colour helpers.
import { describe, expect, it } from "vitest";
import { contrastRatio, luminance, readableTextOn } from "./color";
import { PROJECT_COLORS, suggestPrefix, validateProjectForm } from "./projectForm";

describe("suggestPrefix", () => {
  it("makes a short lowercase prefix", () => {
    expect(suggestPrefix("Feather")).toBe("feather");
    expect(suggestPrefix("Feather Core Icons")).toBe("feather-co");
    expect(suggestPrefix("  My_Project!! ")).toBe("my-project");
    expect(suggestPrefix("Café")).toBe("cafe");
  });

  it("falls back to icon", () => {
    expect(suggestPrefix("")).toBe("icon");
    expect(suggestPrefix("日本語")).toBe("icon");
    expect(suggestPrefix("---")).toBe("icon");
  });
});

describe("validateProjectForm", () => {
  it("accepts a good form", () => {
    expect(validateProjectForm({ name: "Feather", prefix: "feather" })).toEqual({});
  });

  it("explains what is wrong", () => {
    expect(validateProjectForm({ name: "  ", prefix: "ok" }).name).toMatch(/enter a name/i);
    expect(validateProjectForm({ name: "x".repeat(101), prefix: "ok" }).name).toMatch(/100/);
    expect(validateProjectForm({ name: "ok", prefix: "has space" }).prefix).toMatch(/lowercase/i);
    expect(validateProjectForm({ name: "ok", prefix: "" }).prefix).toBeDefined();
    expect(validateProjectForm({ name: "ok", prefix: "x".repeat(21) }).prefix).toBeDefined();
  });

  it("treats upper-case prefix as fine because it is lower-cased when sent", () => {
    expect(validateProjectForm({ name: "ok", prefix: "Feather" })).toEqual({});
  });
});

describe("colour helpers", () => {
  it("computes contrast", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 3);
    expect(luminance("#000000")).toBeCloseTo(0, 3);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("picks readable text for light and dark backgrounds", () => {
    expect(readableTextOn("#ffffff")).toBe("#0a0a0b");
    expect(readableTextOn("#fde047")).toBe("#0a0a0b");
    expect(readableTextOn("#1e293b")).toBe("#ffffff");
    expect(readableTextOn("not a colour")).toBe("#ffffff");
  });

  it("every offered accent colour gives text at least 4.5:1", () => {
    for (const { name, value } of PROJECT_COLORS) {
      expect(contrastRatio(value, readableTextOn(value)), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("also for the server's default colour", () => {
    expect(contrastRatio("#3b82f6", readableTextOn("#3b82f6"))).toBeGreaterThanOrEqual(4.5);
  });
});
