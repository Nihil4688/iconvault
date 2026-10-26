// Tests for the folder tree: structure and counts, selection, expanding, the folder actions and their dialogs, read-only mode, and dropping icons on folders.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolderWithCount } from "../../api/types";
import { DRAG_TYPE } from "../../lib/dragIcons";
import { makeFolder } from "../../test/fixtures";
import FolderTree from "./FolderTree";

const ui = makeFolder({ id: "ui", name: "UI", iconCount: 2 });
const arrows = makeFolder({ id: "arrows", name: "Arrows", parentId: "ui", iconCount: 3 });
const brand = makeFolder({ id: "brand", name: "Brand", orderIndex: 1, iconCount: 1 });

function setup(over: Partial<React.ComponentProps<typeof FolderTree>> = {}) {
  const props = {
    folders: [ui, arrows, brand] as FolderWithCount[],
    uncategorizedCount: 4,
    totalCount: 10,
    selected: "all",
    onSelect: vi.fn(),
    canEdit: true,
    onCreate: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onMove: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onDropIcons: vi.fn(),
    ...over,
  };
  render(<FolderTree {...props} />);
  return props;
}

const rowOf = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) }).parentElement as HTMLElement;
const dragData = (ids: string[]) => ({ types: [DRAG_TYPE], getData: () => JSON.stringify(ids), dropEffect: "" });

beforeEach(() => vi.clearAllMocks());

describe("structure", () => {
  it("lists All icons, Uncategorized and the folders with counts that include subfolders", () => {
    setup();
    expect(screen.getByRole("navigation", { name: "Folders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All icons/ })).toHaveTextContent("10");
    expect(screen.getByRole("button", { name: /Uncategorized/ })).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /^UI/ })).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /^Arrows/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /^Brand/ })).toHaveTextContent("1");
  });

  it("marks the selected entry", () => {
    setup({ selected: "arrows" });
    expect(screen.getByRole("button", { name: /^Arrows/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /All icons/ })).not.toHaveAttribute("aria-current");
  });

  it("reports what was chosen", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Arrows/ }));
    await userEvent.click(screen.getByRole("button", { name: /Uncategorized/ }));
    await userEvent.click(screen.getByRole("button", { name: /All icons/ }));
    expect(vi.mocked(onSelect).mock.calls.map((call) => call[0])).toEqual(["arrows", "root", "all"]);
  });

  it("collapses and expands a folder that has subfolders", async () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Collapse UI" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);
    expect(screen.queryByRole("button", { name: /^Arrows/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand UI" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "Expand UI" }));
    expect(screen.getByRole("button", { name: /^Arrows/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Collapse Brand/ })).not.toBeInTheDocument();
  });
});

describe("folder actions", () => {
  it("creates a root folder", async () => {
    const { onCreate } = setup();
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = screen.getByRole("dialog", { name: "New folder" });
    await userEvent.type(within(dialog).getByLabelText("Folder name"), "  Logos ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(onCreate).toHaveBeenCalledWith(null, "Logos");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates a subfolder under the chosen folder", async () => {
    const { onCreate } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder Brand" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "New subfolder" }));
    const dialog = screen.getByRole("dialog", { name: "New subfolder in “Brand”" });
    await userEvent.type(within(dialog).getByLabelText("Folder name"), "Dark");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(onCreate).toHaveBeenCalledWith("brand", "Dark");
  });

  it("refuses an empty name and shows an error from the server inside the dialog", async () => {
    const { onCreate } = setup({ onCreate: vi.fn().mockRejectedValue(new Error('A folder named "Logos" already exists here.')) });
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Folder name"), "Logos");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
    expect(await within(dialog).findByText('A folder named "Logos" already exists here.')).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renames, with the current name filled in", async () => {
    const { onRename } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder Arrows" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename folder" });
    const input = within(dialog).getByLabelText("Folder name");
    expect(input).toHaveValue("Arrows");
    await userEvent.clear(input);
    await userEvent.type(input, "Directions");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: "arrows" }), "Directions");
  });

  it("moves a folder, offering neither itself nor its subfolders as the destination", async () => {
    const { onMove } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder UI" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to…" }));
    const dialog = screen.getByRole("dialog", { name: "Move “UI”" });
    const select = within(dialog).getByLabelText("Move into");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Project root", "Brand"]);
    await userEvent.selectOptions(select, "brand");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move folder" }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: "ui" }), "brand");
  });

  it("moves a subfolder to the project root", async () => {
    const { onMove } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder Arrows" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Move into")).toHaveValue("ui");
    await userEvent.selectOptions(within(dialog).getByLabelText("Move into"), "");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move folder" }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: "arrows" }), null);
  });

  it("asks before deleting and explains what happens to the icons", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder UI" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete folder “UI”?" });
    expect(dialog).toHaveTextContent("move to Uncategorized");
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete folder" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "ui" }));
  });
});

describe("read-only", () => {
  it("shows no way to change folders", () => {
    setup({ canEdit: false });
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions for folder/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^UI/ })).toBeInTheDocument();
  });

  it("does not accept dropped icons", () => {
    const { onDropIcons } = setup({ canEdit: false });
    fireEvent.drop(rowOf("Brand"), { dataTransfer: dragData(["a"]) });
    expect(onDropIcons).not.toHaveBeenCalled();
  });
});

describe("dropping icons", () => {
  it("moves dragged icons into the folder they are dropped on", () => {
    const { onDropIcons } = setup();
    fireEvent.dragOver(rowOf("Brand"), { dataTransfer: dragData(["a", "b"]) });
    fireEvent.drop(rowOf("Brand"), { dataTransfer: dragData(["a", "b"]) });
    expect(onDropIcons).toHaveBeenCalledWith("brand", ["a", "b"]);
  });

  it("moves them to the project root when dropped on Uncategorized", () => {
    const { onDropIcons } = setup();
    fireEvent.drop(rowOf("Uncategorized"), { dataTransfer: dragData(["a"]) });
    expect(onDropIcons).toHaveBeenCalledWith(null, ["a"]);
  });

  it("highlights the target while dragging over it and clears it on leave", () => {
    setup();
    const row = rowOf("Brand");
    fireEvent.dragOver(row, { dataTransfer: dragData(["a"]) });
    expect(row.className).toContain("ring-primary");
    fireEvent.dragLeave(row);
    expect(row.className).not.toContain("ring-primary");
  });

  it("ignores drags that are not icons, and has no drop target on All icons", () => {
    const { onDropIcons } = setup();
    const foreign = { types: ["text/plain"], getData: () => "hello", dropEffect: "" };
    fireEvent.dragOver(rowOf("Brand"), { dataTransfer: foreign });
    fireEvent.drop(rowOf("Brand"), { dataTransfer: foreign });
    fireEvent.drop(rowOf("All icons"), { dataTransfer: dragData(["a"]) });
    expect(onDropIcons).not.toHaveBeenCalled();
  });

  it("ignores a drop with unreadable data", () => {
    const { onDropIcons } = setup();
    fireEvent.drop(rowOf("Brand"), { dataTransfer: { types: [DRAG_TYPE], getData: () => "not json", dropEffect: "" } });
    expect(onDropIcons).not.toHaveBeenCalled();
  });
});

describe("the Uncategorized menu", () => {
  it("offers rename and move-to-trash to the owner, with the group's own name shown", async () => {
    setup({ canManage: true, uncategorizedName: "Loose", onRenameUncategorized: vi.fn().mockResolvedValue(undefined), onTrashUncategorized: vi.fn().mockResolvedValue(undefined) });
    expect(screen.getByRole("button", { name: /^Loose/ })).toHaveTextContent("4");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Loose" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Reset name", "Move all to trash"]);
  });

  it("renames through a dialog and resets the name", async () => {
    const onRenameUncategorized = vi.fn().mockResolvedValue(undefined);
    setup({ canManage: true, uncategorizedName: "Loose", onRenameUncategorized, onTrashUncategorized: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Actions for Loose" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename “Loose”" });
    const input = within(dialog).getByRole("textbox");
    expect(input).toHaveValue("Loose");
    await userEvent.clear(input);
    await userEvent.type(input, "Misc");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(onRenameUncategorized).toHaveBeenCalledWith("Misc");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Loose" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset name" }));
    expect(onRenameUncategorized).toHaveBeenLastCalledWith("");
  });

  it("asks before moving everything to the trash, then does it", async () => {
    const onTrashUncategorized = vi.fn().mockResolvedValue(undefined);
    setup({ onTrashUncategorized });
    await userEvent.click(screen.getByRole("button", { name: "Actions for Uncategorized" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Move all to trash"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Move all to trash" }));
    const dialog = screen.getByRole("dialog", { name: /Move all 4 icons in “Uncategorized” to the trash\?/ });
    expect(onTrashUncategorized).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move to trash" }));
    expect(onTrashUncategorized).toHaveBeenCalledTimes(1);
  });

  it("disables move-to-trash when there is nothing loose", async () => {
    setup({ uncategorizedCount: 0, onTrashUncategorized: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Actions for Uncategorized" }));
    expect(screen.getByRole("menuitem", { name: "Move all to trash" })).toBeDisabled();
  });

  it("has no menu for people who cannot edit", () => {
    setup({ canEdit: false, onTrashUncategorized: vi.fn() });
    expect(screen.queryByRole("button", { name: "Actions for Uncategorized" })).not.toBeInTheDocument();
  });
});
