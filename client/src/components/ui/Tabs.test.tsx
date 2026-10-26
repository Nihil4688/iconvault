// Tests for the tabs component.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Tabs from "./Tabs";

function Demo() {
  const [value, setValue] = useState<"files" | "paste" | "url">("files");
  return (
    <Tabs
      label="Add icons"
      value={value}
      onChange={setValue}
      tabs={[
        { value: "files", label: "Files" },
        { value: "paste", label: "Paste" },
        { value: "url", label: "Link" },
      ]}
    >
      <p>{`Panel for ${value}`}</p>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("has a labelled tablist, one selected tab and a panel tied to it", () => {
    render(<Demo />);
    expect(screen.getByRole("tablist", { name: "Add icons" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Paste" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Files");
    expect(screen.getByText("Panel for files")).toBeInTheDocument();
  });

  it("puts only the selected tab in the tab order", () => {
    render(<Demo />);
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Paste" })).toHaveAttribute("tabindex", "-1");
  });

  it("switches on click", async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole("tab", { name: "Paste" }));
    expect(screen.getByText("Panel for paste")).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Paste");
  });

  it("moves with the arrow keys, wrapping, and Home and End, moving focus too", async () => {
    render(<Demo />);
    screen.getByRole("tab", { name: "Files" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Paste" })).toHaveFocus();
    expect(screen.getByText("Panel for paste")).toBeInTheDocument();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Link" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Files" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Link" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Files" })).toHaveFocus();
  });
});
