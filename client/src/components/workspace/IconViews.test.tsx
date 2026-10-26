// Tests for the icon cards, the table view, the toolbar and the bulk bar with its dialogs.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DRAG_TYPE } from "../../lib/dragIcons";
import { DEFAULT_APPEARANCE } from "../../lib/iconAppearance";
import { makeFolder, makeIcon } from "../../test/fixtures";
import BulkBar from "./BulkBar";
import { MoveIconsDialog, TagIconsDialog } from "./BulkDialogs";
import IconCard from "./IconCard";
import IconList from "./IconList";
import IconToolbar from "./IconToolbar";
import SelectAllBar from "./SelectAllBar";

describe("IconCard", () => {
  const setup = (over: Partial<React.ComponentProps<typeof IconCard>> = {}) => {
    const props = { icon: makeIcon({ name: "Arrow Left", byteSize: 1536 }), selected: false, surface: "theme" as const, appearance: DEFAULT_APPEARANCE, canDrag: true, dragIds: () => ["a"], onToggle: vi.fn(), onOpen: vi.fn(), ...over };
    render(
      <ul>
        <IconCard {...props} />
      </ul>,
    );
    return props;
  };

  it("shows the name and size, and opens or selects separately", async () => {
    const { onOpen, onToggle } = setup();
    expect(screen.getByText("Arrow Left")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Arrow Left" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Arrow Left" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("reflects whether it is selected", () => {
    setup({ selected: true });
    expect(screen.getByRole("checkbox", { name: "Select Arrow Left" })).toBeChecked();
  });

  it("warns about what will not become a font glyph, in words", () => {
    setup({ icon: makeIcon({ hasStroke: true, hasText: true }) });
    expect(screen.getByText("Stroke")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.queryByText("Gradient")).not.toBeInTheDocument();
  });

  it("shows no warnings for a clean icon", () => {
    setup();
    expect(screen.queryByText("Stroke")).not.toBeInTheDocument();
  });

  it("can be dragged only when allowed, carrying the ids it is told to", () => {
    setup({ dragIds: () => ["a", "b"] });
    const item = screen.getByRole("listitem");
    expect(item).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(item, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith(DRAG_TYPE, JSON.stringify(["a", "b"]));
  });

  it("is not draggable for people who cannot edit", () => {
    setup({ canDrag: false });
    expect(screen.getByRole("listitem")).toHaveAttribute("draggable", "false");
  });
});

describe("IconList", () => {
  const folders = [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "ar", name: "Arrows", parentId: "ui" })];
  const icons = [makeIcon({ id: "i1", name: "Left", folderId: "ar", tags: ["nav", "arrow"], byteSize: 300 }), makeIcon({ id: "i2", name: "Plain", folderId: null, hasGradient: true })];

  function setup() {
    const props = { icons, folders, isSelected: (id: string) => id === "i2", surface: "theme" as const, appearance: DEFAULT_APPEARANCE, canDrag: true, dragIds: (id: string) => [id], onToggle: vi.fn(), onOpen: vi.fn() };
    render(<IconList {...props} />);
    return props;
  }

  it("is a table with named columns and one row per icon", () => {
    setup();
    expect(screen.getByRole("table", { name: "Icons" })).toBeInTheDocument();
    // The scroll box must be positioned, or the table's hidden text widens the page on a phone.
    expect(screen.getByRole("table", { name: "Icons" }).parentElement).toHaveClass("relative", "overflow-x-auto");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Select", "Preview", "Name", "Folder", "Size", "Tags", "Updated"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows folder path, size, tags and warnings", () => {
    setup();
    const row = screen.getByRole("button", { name: "Left" }).closest("tr") as HTMLElement;
    expect(within(row).getByText("UI / Arrows")).toBeInTheDocument();
    expect(within(row).getByText("300 B")).toBeInTheDocument();
    expect(within(row).getByText("nav, arrow")).toBeInTheDocument();
    const plain = screen.getByRole("button", { name: "Plain" }).closest("tr") as HTMLElement;
    expect(within(plain).getByText("Project root")).toBeInTheDocument();
    expect(within(plain).getByText("Gradient")).toBeInTheDocument();
  });

  it("selects and opens", async () => {
    const { onToggle, onOpen } = setup();
    expect(screen.getByRole("checkbox", { name: "Select Plain" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Left" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Left" }));
    expect(onToggle).toHaveBeenCalledWith("i1");
    await userEvent.click(screen.getByRole("button", { name: "Left" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }));
  });

  it("rows can be dragged with their ids", () => {
    setup();
    const setData = vi.fn();
    fireEvent.dragStart((screen.getByRole("button", { name: "Left" }).closest("tr")) as HTMLElement, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith(DRAG_TYPE, JSON.stringify(["i1"]));
  });
});

describe("IconToolbar", () => {
  function setup(over: Partial<React.ComponentProps<typeof IconToolbar>> = {}) {
    const props = {
      search: "",
      onSearch: vi.fn(),
      sort: "newest" as const,
      onSort: vi.fn(),
      view: "grid" as const,
      onView: vi.fn(),
      surface: "theme" as const,
      onSurface: vi.fn(),
      appearance: DEFAULT_APPEARANCE,
      onAppearance: vi.fn(),
      canAdd: true,
      onUpload: vi.fn(),
      ...over,
    };
    render(<IconToolbar {...props} />);
    return props;
  }

  it("reports searching, sorting, background and view changes", async () => {
    const { onSearch, onSort, onSurface, onView } = setup();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search icons" }), "ar");
    expect(onSearch).toHaveBeenLastCalledWith("r");
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "name");
    expect(onSort).toHaveBeenCalledWith("name");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Checkerboard" }));
    expect(onSurface).toHaveBeenCalledWith("checker");
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onView).toHaveBeenCalledWith("list");
  });

  it("marks the current view", () => {
    setup({ view: "list" });
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers uploading and copying only to people who can add", async () => {
    const props = setup();
    const onUpload = vi.mocked(props.onUpload);
    await userEvent.click(screen.getByRole("button", { name: "Upload icons" }));
    expect(onUpload).toHaveBeenLastCalledWith("files");
    await userEvent.click(screen.getByRole("button", { name: "From Another Project" }));
    expect(onUpload).toHaveBeenLastCalledWith("copy");
  });

  it("changes the icon size with the slider and the plus and minus buttons", async () => {
    const { onAppearance } = setup();
    expect(screen.getByRole("group", { name: "Icon size" })).toHaveTextContent("40px");
    await userEvent.click(screen.getByRole("button", { name: "Larger icons" }));
    expect(onAppearance).toHaveBeenLastCalledWith({ size: 44 });
    await userEvent.click(screen.getByRole("button", { name: "Smaller icons" }));
    expect(onAppearance).toHaveBeenLastCalledWith({ size: 36 });
    fireEvent.change(screen.getByRole("slider", { name: "Icon size in pixels" }), { target: { value: "64" } });
    expect(onAppearance).toHaveBeenLastCalledWith({ size: 64 });
  });

  it("stops the size at its limits", () => {
    setup({ appearance: { ...DEFAULT_APPEARANCE, size: 16 } });
    expect(screen.getByRole("button", { name: "Smaller icons" })).toBeDisabled();
    cleanup();
    setup({ appearance: { ...DEFAULT_APPEARANCE, size: 96 } });
    expect(screen.getByRole("button", { name: "Larger icons" })).toBeDisabled();
  });

  it("offers three swatches and a picker for more colours", async () => {
    const { onAppearance } = setup({ appearance: { ...DEFAULT_APPEARANCE, color: "#3b82f6" } });
    const group = screen.getByRole("group", { name: "Icon colour" });
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["White", "Black", "Blue"]);
    expect(within(group).getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Black" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(group).getByRole("button", { name: "Black" }));
    expect(onAppearance).toHaveBeenLastCalledWith({ color: "#000000" });
    // The chosen swatch again goes back to the default colour.
    await userEvent.click(within(group).getByRole("button", { name: "Blue" }));
    expect(onAppearance).toHaveBeenLastCalledWith({ color: "" });
    fireEvent.change(within(group).getByLabelText("More colours"), { target: { value: "#123456" } });
    expect(onAppearance).toHaveBeenLastCalledWith({ color: "#123456" });
  });

  it("shows the style names next to their icons", () => {
    setup();
    expect(screen.getByRole("group", { name: "Icon style" })).toHaveTextContent("NaturalFlatWireframe");
  });

  it("sorts from an icon whose menu names the current sort", async () => {
    const { onSort } = setup();
    expect(screen.getByTitle("Sort: Newest")).toBeInTheDocument();
    expect(screen.queryByText("Newest", { selector: "span" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "largest");
    expect(onSort).toHaveBeenCalledWith("largest");
  });

  it("picks a style and marks the current one", async () => {
    const { onAppearance } = setup({ appearance: { ...DEFAULT_APPEARANCE, style: "flat" } });
    const group = screen.getByRole("group", { name: "Icon style" });
    expect(within(group).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["Natural", "false"], ["Flat", "true"], ["Wireframe", "false"]]);
    await userEvent.click(within(group).getByRole("button", { name: "Wireframe" }));
    expect(onAppearance).toHaveBeenLastCalledWith({ style: "wireframe" });
  });

  it("has no breadcrumb, no background dropdown, and search before the size control", () => {
    setup();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Preview background")).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search icons" });
    const size = screen.getByRole("group", { name: "Icon size" });
    expect(search.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the preview background in the More menu: a single choice with the current one checked", async () => {
    const { onSurface } = setup({ surface: "light" });
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    const menu = screen.getByRole("menu", { name: "More view options" });
    expect(within(menu).getAllByRole("menuitemradio").map((i) => [i.textContent, i.getAttribute("aria-checked")])).toEqual([["Match theme", "false"], ["Light", "true"], ["Dark", "false"], ["Checkerboard", "false"]]);
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Dark" }));
    expect(onSurface).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("moves through the More menu with the keyboard and closes on Escape or an outside click", async () => {
    setup();
    const more = screen.getByRole("button", { name: "More" });
    more.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Match theme" })).toHaveFocus());
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "Checkerboard" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Match theme" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    await userEvent.click(more);
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("puts the add buttons into the header slot when there is one", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    setup({ actionsHost: host });
    expect(within(host).getByRole("button", { name: "Upload icons" })).toBeInTheDocument();
    expect(within(host).getByRole("button", { name: "From Another Project" })).toBeInTheDocument();
    host.remove();
  });

  it("lists every way to add icons in the Upload icons menu", async () => {
    const onUpload = vi.mocked(setup().onUpload);
    const trigger = screen.getByRole("button", { name: "More ways to add icons" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Add icons" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Upload Files / ZIPUpload SVGs or drag & drop ZIP files",
      "From Another ProjectNewSelect and copy icons from other workspaces",
      "Import SVG SpriteExtract symbols from an SVG sprite file",
      "Import Icon FontExtract glyphs from TTF, WOFF, WOFF2",
      "Paste SVG CodePaste raw SVG markup directly",
    ]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Import Icon Font/ }));
    expect(onUpload).toHaveBeenCalledWith("font");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: /Import SVG Sprite/ }));
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: /Paste SVG Code/ }));
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: /From Another Project/ }));
    expect(onUpload.mock.calls.map((call) => call[0])).toEqual(["font", "sprite", "paste", "copy"]);
  });

  it("moves through the menu with the keyboard and closes on Escape", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: "More ways to add icons" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Upload Files/ })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /From Another Project/ })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: /Paste SVG Code/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Upload Files/ })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the menu when clicking elsewhere", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "More ways to add icons" }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("hides add and copy for read-only users", () => {
    setup({ canAdd: false });
    expect(screen.queryByRole("button", { name: "Upload icons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More ways to add icons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "From Another Project" })).not.toBeInTheDocument();
  });
  it("has no select all in the toolbar (it sits above the icon list)", () => {
    setup();
    expect(screen.queryByRole("checkbox", { name: /Select all/ })).not.toBeInTheDocument();
  });
});

describe("BulkBar", () => {
  function setup(over: Partial<React.ComponentProps<typeof BulkBar>> = {}) {
    const props = { count: 3, canEdit: true, busy: false, generate: "sprite" as const, onMove: vi.fn(), onTag: vi.fn(), onOptimize: vi.fn(), onGenerate: vi.fn(), onDownload: vi.fn(), onDelete: vi.fn(), onClear: vi.fn(), ...over };
    render(<BulkBar {...props} />);
    return props;
  }

  it("says how many are selected and offers every action to editors", async () => {
    const p = setup();
    expect(screen.getByRole("region", { name: "Selected icons" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 icons selected");
    for (const [name, fn] of [["Move", p.onMove], ["Tag", p.onTag], ["Optimize", p.onOptimize], ["Build sprite", p.onGenerate], ["Download", p.onDownload], ["Delete", p.onDelete], ["Clear selection", p.onClear]] as const) {
      await userEvent.click(screen.getByRole("button", { name }));
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("offers only Download and Clear to people who cannot edit", () => {
    setup({ canEdit: false, count: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("1 icon selected");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Build sprite", "Download", "Clear selection"]);
  });

  it("puts Generate before Download, as the primary action, and names it after the project type", () => {
    setup();
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names.indexOf("Build sprite")).toBe(names.indexOf("Download") - 1);
    expect(screen.getByRole("button", { name: "Build sprite" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "Download" }).className).not.toContain("bg-primary ");
    cleanup();
    setup({ generate: "font" });
    expect(screen.getByRole("button", { name: "Build font" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build sprite" })).not.toBeInTheDocument();
  });

  it("shows the Build button as working while it builds", () => {
    setup({ generating: true, busy: true, generate: "font" });
    expect(screen.getByRole("button", { name: "Build font" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Build font" })).toHaveAttribute("aria-busy", "true");
  });

  it("disables the actions while one is running", () => {
    setup({ busy: true });
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeEnabled();
  });
});

describe("bulk dialogs", () => {
  const folders = [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "ar", name: "Arrows", parentId: "ui" })];

  it("moves into a folder or the project root, and shows a failure", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("That folder does not exist in this project.")).mockResolvedValue(undefined);
    render(<MoveIconsDialog open count={2} folders={folders} onClose={vi.fn()} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Move 2 icons" });
    expect(within(within(dialog).getByLabelText("Move into")).getAllByRole("option").map((o) => o.textContent?.trim())).toEqual(["Uncategorized (project root)", "UI", "Arrows"]);
    await userEvent.selectOptions(within(dialog).getByLabelText("Move into"), "ar");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(onSubmit).toHaveBeenCalledWith("ar");
    expect(await within(dialog).findByText("That folder does not exist in this project.")).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Move into"), "");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(onSubmit).toHaveBeenLastCalledWith(null);
  });

  it("tags with add, remove or replace, and needs at least one tag", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TagIconsDialog open count={1} onClose={vi.fn()} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Tag 1 icon" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(within(dialog).getByText("Enter at least one tag.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Tags"), "UI, nav, ui");
    await userEvent.selectOptions(within(dialog).getByLabelText("Action"), "set");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onSubmit).toHaveBeenCalledWith(["ui", "nav"], "set");
  });
});

describe("SelectAllBar", () => {
  it("reflects none, some and all selected, and reports the choice", async () => {
    const onSelectAll = vi.fn();
    render(<SelectAllBar loaded={5} selected={0} onSelectAll={onSelectAll} />);
    const box = screen.getByRole("checkbox", { name: "Select all 5 shown" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(false);
    await userEvent.click(box);
    expect(onSelectAll).toHaveBeenCalledWith(true);
  });

  it("shows a partial selection as indeterminate and a full one as checked", () => {
    const { unmount } = render(<SelectAllBar loaded={4} selected={2} onSelectAll={() => {}} />);
    expect((screen.getByRole("checkbox", { name: "Select all 4 shown" }) as HTMLInputElement).indeterminate).toBe(true);
    unmount();
    render(<SelectAllBar loaded={4} selected={4} onSelectAll={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "Select all 4 shown" })).toBeChecked();
  });

  it("is off when there is nothing to select", () => {
    render(<SelectAllBar loaded={0} selected={0} onSelectAll={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "Select all 0 shown" })).toBeDisabled();
  });
});
