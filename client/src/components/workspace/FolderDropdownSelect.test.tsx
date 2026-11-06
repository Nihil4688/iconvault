import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFolder } from "../../test/fixtures";
import FolderDropdownSelect from "./FolderDropdownSelect";

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");

afterEach(() => {
  if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
  if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
});

describe("FolderDropdownSelect", () => {
  it("opens below the trigger when the available space fits the menu's height limit", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.getAttribute("role") === "menu" ? 600 : 0;
      },
    });

    render(<FolderDropdownSelect value="" folders={[]} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Folder: Uncategorized (Project Root)" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 500,
      top: 500,
      left: 0,
      right: 240,
      bottom: 536,
      width: 240,
      height: 36,
      toJSON: () => ({}),
    });

    await userEvent.click(trigger);

    expect(screen.getByRole("menu", { name: "Folder" })).toHaveStyle({ top: "540px" });
  });

  it("does not continue a child connector between separate root folders", async () => {
    const folders = [
      makeFolder({ id: "parent-a", name: "Parent A" }),
      makeFolder({ id: "child-a", name: "Child A", parentId: "parent-a" }),
      makeFolder({ id: "child-b", name: "Child B", parentId: "parent-a" }),
      makeFolder({ id: "grandchild", name: "Grandchild", parentId: "child-a" }),
      makeFolder({ id: "parent-b", name: "Parent B" }),
    ];
    render(<FolderDropdownSelect value="" folders={folders} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Folder: Uncategorized (Project Root)" }));

    const menu = screen.getByRole("menu", { name: "Folder" });
    const grandchildRow = screen.getByRole("menuitemradio", { name: "Grandchild" });
    const rootParentContinuations = Array.from(grandchildRow.querySelectorAll("span")).filter(
      (element) => element.style.left === "18px" && element.style.top === "-2px" && element.style.bottom === "-2px",
    );
    const childParentContinuations = Array.from(grandchildRow.querySelectorAll("span")).filter(
      (element) => element.style.left === "48px" && element.style.top === "-2px" && element.style.bottom === "-2px",
    );

    expect(menu).toBeInTheDocument();
    expect(rootParentContinuations).toHaveLength(0);
    expect(childParentContinuations).toHaveLength(1);
  });
});
