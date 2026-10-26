// Tests for the coloured visibility and type badges: each kind has its own colour and always its words.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurposeBadge, VisibilityBadge } from "./ProjectBadges";

describe("VisibilityBadge", () => {
  it("shows Private and Public in different colours", () => {
    const { rerender } = render(<VisibilityBadge visibility="private" />);
    expect(screen.getByText("Private").className).toContain("violet");
    rerender(<VisibilityBadge visibility="public" />);
    expect(screen.getByText("Public").className).toContain("emerald");
  });
});

describe("PurposeBadge", () => {
  it("uses short or long words, and a colour per type", () => {
    const { rerender } = render(<PurposeBadge purpose="font" />);
    expect(screen.getByText("Font").className).toContain("indigo");
    rerender(<PurposeBadge purpose="font" long />);
    expect(screen.getByText("Icon Font Project")).toBeInTheDocument();
    rerender(<PurposeBadge purpose="sprite" />);
    expect(screen.getByText("Sprite").className).toContain("amber");
    rerender(<PurposeBadge purpose="sprite" long />);
    expect(screen.getByText("Sprite Project")).toBeInTheDocument();
  });
});
