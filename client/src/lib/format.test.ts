// Tests for number and date formatting.
import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatRelative, pluralize, savingsPercent } from "./format";

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("returns nothing for impossible values", () => {
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("describes recent and older times", () => {
    expect(formatRelative("2026-10-20T11:59:50Z", now)).toBe("just now");
    expect(formatRelative("2026-10-20T11:30:00Z", now)).toBe("30 minutes ago");
    expect(formatRelative("2026-10-20T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-10-19T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelative("2026-10-13T12:00:00Z", now)).toBe("last week");
    expect(formatRelative("2026-08-20T12:00:00Z", now)).toBe("2 months ago");
  });

  it("ignores bad input", () => {
    expect(formatRelative("not a date", now)).toBe("");
  });
});

describe("other helpers", () => {
  it("formats dates and counts", () => {
    expect(formatDate("2026-10-20T12:00:00Z")).toMatch(/Oct 20, 2026/);
    expect(formatDate("nope")).toBe("");
    expect(pluralize(1, "icon")).toBe("1 icon");
    expect(pluralize(3, "icon")).toBe("3 icons");
    expect(pluralize(2, "box", "boxes")).toBe("2 boxes");
  });

  it("computes savings", () => {
    expect(savingsPercent(200, 100)).toBe(50);
    expect(savingsPercent(100, 100)).toBe(0);
    expect(savingsPercent(100, 150)).toBe(0);
    expect(savingsPercent(0, 0)).toBe(0);
  });
});
