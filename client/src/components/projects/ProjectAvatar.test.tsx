import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProjectAvatar from "./ProjectAvatar";

describe("ProjectAvatar", () => {
  it("uses white initials for light and dark project colours", () => {
    const { rerender } = render(<ProjectAvatar name="Light" color="#f8fafc" />);
    expect(screen.getByText("L")).toHaveClass("text-white");

    rerender(<ProjectAvatar name="Dark" color="#1e293b" />);
    expect(screen.getByText("D")).toHaveClass("text-white");
  });
});
