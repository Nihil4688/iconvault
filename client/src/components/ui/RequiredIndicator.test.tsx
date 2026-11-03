import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextField } from "./Fields";
import { RequiredIndicator } from "./RequiredIndicator";

describe("RequiredIndicator", () => {
  it("shows a red asterisk with an accessible required label", () => {
    const { container } = render(<RequiredIndicator />);

    expect(container.querySelector(".text-red-600")).toHaveTextContent("*");
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
  });

  it("appears beside labels for required fields", () => {
    const { container } = render(<TextField label="Project name" required />);

    expect(container.querySelector("label")).toHaveTextContent("Project name");
    expect(container.querySelector(".text-red-600")).toHaveTextContent("*");
    expect(screen.getByRole("textbox")).toBeRequired();
  });

  it("does not mark optional fields as required", () => {
    const { container } = render(<TextField label="Description" />);

    expect(container.querySelector(".text-red-600")).not.toBeInTheDocument();
  });
});
