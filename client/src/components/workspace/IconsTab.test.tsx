// Tests for the Icons section: loading and empty states, what is asked of the server for each folder, search and sort, views, "show more", selection, every bulk action (with undo for trash), read-only behaviour, failures, and opening an icon.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as fontsApi from "../../api/fonts";
import * as iconsApi from "../../api/icons";
import { ToastProvider } from "../../context/ToastContext";
import { WorkspaceContext, type WorkspaceContextValue } from "../../context/workspaceContext";
import { useSelection } from "../../hooks/useSelection";
import { DRAG_TYPE } from "../../lib/dragIcons";
import { clearCachedBuild, peekCachedBuild } from "../../lib/fontBuildCache";
import * as preview from "../../lib/fontPreview";
import { READ_ONLY, makeDetail, makeFolder, makeIcon } from "../../test/fixtures";
import * as zip from "../../utils/zipBundle";
import IconsTab from "./IconsTab";

vi.mock("../ui/SvgPreview", () => ({ default: ({ size, color }: { size: number; color?: string }) => <span data-testid="svg-preview" data-size={size} data-color={color ?? ""} /> }));
vi.mock("../../api/icons");
vi.mock("../../api/fonts");
vi.mock("../../lib/fontPreview", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/fontPreview")>()), loadPreviewFont: vi.fn(), unloadPreviewFont: vi.fn() }));
vi.mock("../../api/projects");
vi.mock("../../api/folders");
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));

const listIcons = vi.mocked(iconsApi.listIcons);
const reply = (icons: ReturnType<typeof makeIcon>[], total = icons.length) => ({ icons, total, page: 1, limit: 200 });

function Where() {
  const location = useLocation();
  return <p data-testid="where" data-state={JSON.stringify(location.state)}>{location.pathname}</p>;
}

// The wrapper owns the selection so its state survives across rerenders, and exposes a setter so the test can swap in a fresh `base` without losing the selection. The latest controller values are written into the ref after each render through an effect that depends on the values it publishes, so React sees a consistent dependency list.
function StableWrapper({ initialBase, controllerRef, children }: { initialBase: WorkspaceContextValue; controllerRef: { current: { setBase: (next: WorkspaceContextValue) => void; selection: ReturnType<typeof useSelection> | null } | null }; children: ReactNode }) {
  const [base, setBase] = useState<WorkspaceContextValue>(initialBase);
  const selection = useSelection("p1");
  useEffect(() => {
    controllerRef.current = { setBase, selection };
  }, [controllerRef, setBase, selection]);
  const value = useMemo<WorkspaceContextValue>(() => ({ ...base, selection }), [base, selection]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function setup(over: Partial<WorkspaceContextValue> = {}) {
  const fns = { selectFolder: vi.fn(), refreshProject: vi.fn(), refreshFolders: vi.fn(), refreshIcons: vi.fn() };
  const initialBase: WorkspaceContextValue = {
    project: makeDetail({ id: "p1", prefix: "feather", iconCount: 3 }),
    folderList: { folders: [makeFolder({ id: "ui", name: "UI" })], uncategorizedCount: 0 },
    selectedFolder: "all",
    iconsVersion: 0,
    ...fns,
    ...over,
    selection: undefined as unknown as WorkspaceContextValue["selection"],
  };
  const controllerRef: { current: { setBase: (next: WorkspaceContextValue) => void; selection: ReturnType<typeof useSelection> | null } | null } = { current: null };
  render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <ToastProvider>
        <StableWrapper initialBase={initialBase} controllerRef={controllerRef}>
          <IconsTab />
        </StableWrapper>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
  // Re-rendering with the same JSX (same component type and position) keeps the wrapper's state; the test tells the wrapper to swap its `base` instead, which preserves the selection.
  const rerender = (next: Partial<WorkspaceContextValue>) => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("StableWrapper is not mounted");
    controller.setBase({ ...initialBase, ...next });
  };
  return { ...fns, rerender };
}

const three = () => [makeIcon({ id: "a", name: "Alpha" }), makeIcon({ id: "b", name: "Beta" }), makeIcon({ id: "c", name: "Gamma", hasStroke: true })];
const card = (name: string) => screen.getByRole("button", { name: `Open ${name}` }).closest("li") as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  listIcons.mockResolvedValue(reply(three()));
});

describe("showing icons", () => {
  it("shows a loading state, then the icons with how many are shown", async () => {
    setup();
    expect(screen.getByLabelText("Loading icons")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("button", { name: "Open Alpha" })).toBeInTheDocument();
    expect(screen.queryByText(/^Showing \d+ of/)).not.toBeInTheDocument();
    expect(within(card("Gamma")).queryByText("Stroke")).not.toBeInTheDocument();
  });

  it("limits icon size choices to the supported pixel sizes", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });

    const slider = screen.getByRole("slider", { name: "Icon Size in Pixels" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "9");
    expect(slider).toHaveAttribute("step", "1");
    expect(screen.getByText("40px")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Smaller Icons" }));
    expect(screen.getByText("32px")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Larger Icons" }));
    expect(screen.getByText("40px")).toBeInTheDocument();

    for (const [index, size] of [12, 16, 20, 24, 32, 40, 48, 64, 80, 96].entries()) {
      fireEvent.change(slider, { target: { value: String(index) } });
      expect(screen.getByText(`${size}px`)).toBeInTheDocument();
    }
  });

  it("shows the selected color preview before a separator and keeps selection styling on the preview", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });

    const colorGroup = screen.getByRole("group", { name: "Icon Colour" });
    const preview = within(colorGroup).getByRole("img", { name: "Selected icon color: default" });
    expect(preview).toHaveClass("h-5", "w-5", "ring-2");
    expect(preview.querySelector("svg")).toBeInTheDocument();
    expect(colorGroup.querySelector('[aria-hidden="true"].border-l')).toBeInTheDocument();
    expect(within(colorGroup).getByRole("button", { name: "White" })).toHaveClass("h-5", "w-5");
    expect(within(colorGroup).getByRole("button", { name: "White" })).not.toHaveClass("ring-2");

    await userEvent.click(within(colorGroup).getByRole("button", { name: "Blue" }));
    const bluePreview = within(colorGroup).getByRole("img", { name: "Selected icon color: #3b82f6" });
    expect(bluePreview).toHaveClass("ring-2");
    expect(bluePreview).toHaveStyle({ backgroundColor: "#3b82f6" });
    expect(within(colorGroup).getByRole("button", { name: "Blue" })).not.toHaveClass("ring-2");

    fireEvent.change(within(colorGroup).getByLabelText("More Colours"), { target: { value: "#f65a8a" } });
    expect(within(colorGroup).getByRole("img", { name: "Selected icon color: #f65a8a" })).toHaveStyle({ backgroundColor: "#f65a8a" });
  });

  it("places the background control opposite Select all with even vertical spacing", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    const selectAll = screen.getByRole("checkbox", { name: "Select all 3 shown" });
    const more = screen.getByRole("button", { name: "Preview background" });
    expect(selectAll.parentElement?.parentElement).toBe(more.parentElement?.parentElement);
    expect(more.parentElement?.parentElement).toHaveClass("justify-between", "py-2");
  });

  it("keeps the first icon card's selection ring clear of the scroll area's top and left edges", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    const grid = card("Alpha").closest("ul");
    expect(grid?.parentElement).toHaveClass("pt-1", "pl-1");
  });

  it("asks for the newest first, 200 at a time, for the whole project", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenCalledWith("p1", { sort: "newest", limit: 200 });
  });

  it("asks for only the selected folder's icons", async () => {
    const { unmount } = render(<span />);
    unmount();
    setup({ selectedFolder: "ui" });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "newest", limit: 200, folderId: "ui", includeSubfolders: false });
  });

  it("asks for uncategorized icons without subfolders", async () => {
    setup({ selectedFolder: "root" });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "newest", limit: 200, folderId: "root", includeSubfolders: false });
  });

  it("customizes all icons without applying folder-specific appearances", async () => {
    window.localStorage.setItem("project:p1:folder:ui:iconAppearance", JSON.stringify({ size: 56, color: "#123456" }));
    listIcons.mockResolvedValue(reply([
      makeIcon({ id: "ui-icon", name: "UI icon", folderId: "ui" }),
      makeIcon({ id: "nested-icon", name: "Nested icon", folderId: "ar" }),
      makeIcon({ id: "other-icon", name: "Other icon", folderId: "assets" }),
    ]));
    const { rerender } = setup({
      folderList: { folders: [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "ar", name: "Arrows", parentId: "ui" }), makeFolder({ id: "assets", name: "Assets" })], uncategorizedCount: 0 },
      selectedFolder: "all",
    });

    await screen.findByRole("button", { name: "Open Other icon" });

    expect(screen.getAllByTestId("svg-preview").map((preview) => [preview.getAttribute("data-size"), preview.getAttribute("data-color")])).toEqual([
      ["40", ""],
      ["40", ""],
      ["40", ""],
    ]);
    expect(screen.getByText("Changes apply to all icons.")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Icon size in pixels" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Blue" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(screen.getAllByTestId("svg-preview").map((preview) => preview.getAttribute("data-color"))).toEqual(["#3b82f6", "#3b82f6", "#3b82f6"]);
    expect(window.localStorage.getItem("project:p1:folder:all:iconAppearance")).toContain("#3b82f6");

    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getAllByTestId("svg-preview").map((preview) => preview.getAttribute("data-color"))).toEqual(["#3b82f6", "#3b82f6", "#3b82f6"]);

    rerender({ selectedFolder: "ui" });
    await waitFor(() => expect(screen.getAllByTestId("svg-preview").map((preview) => preview.getAttribute("data-color"))).toEqual(["#123456", "", ""]));

    rerender({ selectedFolder: "all" });
    await waitFor(() => expect(screen.getAllByTestId("svg-preview").map((preview) => preview.getAttribute("data-color"))).toEqual(["#3b82f6", "#3b82f6", "#3b82f6"]));
  });

  it("shows an error with a retry", async () => {
    listIcons.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Alpha" })).toBeInTheDocument();
  });
});

describe("empty states", () => {
  beforeEach(() => listIcons.mockResolvedValue(reply([])));

  it("invites adding the first icons", async () => {
    setup();
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();
    const instructions = screen.getByText("Click Upload Icons to get started. Upload SVGs, sprite files, icon fonts, or ZIP packages, paste icon code, or import icons from another project.");
    expect(instructions).toHaveClass("max-w-2xl");
    expect(instructions.querySelector("br")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Upload icons" })[1] as HTMLElement);
    expect(screen.getByRole("dialog", { name: "Add icons" })).toBeInTheDocument();
  });

  it("disables browsing controls when the project has no icons but keeps upload available", async () => {
    setup({ project: makeDetail({ id: "p1", iconCount: 0 }) });
    await screen.findByText("No icons yet.");

    const controls = screen.getByRole("group", { name: "Icon browsing controls" });
    for (const control of controls.querySelectorAll("button, input, select")) {
      expect(control).toBeDisabled();
    }
    expect(screen.getAllByRole("button", { name: "Upload icons" })[0]).toBeEnabled();
  });

  it("keeps browsing controls disabled while switching from empty all-icons to uncategorized", async () => {
    let resolveUncategorized: ((result: ReturnType<typeof reply>) => void) | undefined;
    listIcons.mockImplementation((_projectId, params) => new Promise((resolve) => {
      if (params?.folderId === "root") resolveUncategorized = resolve;
      else resolve(reply([]));
    }));

    const { rerender } = setup({
      project: makeDetail({ id: "p1", iconCount: 0 }),
      folderList: { folders: [], uncategorizedCount: 0 },
    });
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();

    await act(async () => rerender({ selectedFolder: "root" }));
    expect(resolveUncategorized).toBeDefined();
    const controls = screen.getByRole("group", { name: "Icon browsing controls" });
    const disabledWhileSwitching = Array.from(controls.querySelectorAll("button, input, select")).every((control) => control.matches(":disabled"));

    await act(async () => resolveUncategorized?.(reply([])));
    expect(await screen.findByText("No uncategorized icons.")).toBeInTheDocument();

    expect(disabledWhileSwitching).toBe(true);
  });

  it("keeps browsing controls disabled while switching from empty uncategorized to all-icons", async () => {
    const { rerender } = setup({
      project: makeDetail({ id: "p1", iconCount: 0 }),
      folderList: { folders: [], uncategorizedCount: 0 },
      selectedFolder: "root",
    });
    expect(await screen.findByText("No uncategorized icons.")).toBeInTheDocument();

    act(() => rerender({ selectedFolder: "all" }));
    const controls = screen.getByRole("group", { name: "Icon browsing controls" });
    const disabledWhileSwitching = Array.from(controls.querySelectorAll("button, input, select")).every((control) => control.matches(":disabled"));
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();

    expect(disabledWhileSwitching).toBe(true);
  });

  it("tells a read-only viewer that nothing is here, without offering to add", async () => {
    setup({ project: makeDetail({ id: "p1", access: READ_ONLY }) });
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();
    expect(screen.getByText("The owner has not added any here yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload icons" })).not.toBeInTheDocument();
  });

  it("names an empty folder and the uncategorized list", async () => {
    const { unmount } = (() => {
      const r = render(<span />);
      return r;
    })();
    unmount();
    setup({
      selectedFolder: "ui",
      folderList: { folders: [makeFolder({ id: "ui", name: "UI", iconCount: 0 })], uncategorizedCount: 0 },
    });
    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
    const controls = screen.getByRole("group", { name: "Icon browsing controls" });
    for (const control of controls.querySelectorAll("button, input, select")) {
      expect(control).toBeDisabled();
    }
    expect(screen.getAllByRole("button", { name: "Upload icons" })[0]).toBeEnabled();
  });

  it("says no icons are uncategorized", async () => {
    setup({ selectedFolder: "root" });
    expect(await screen.findByText("No uncategorized icons.")).toBeInTheDocument();
  });

  it("says nothing matches a search", async () => {
    setup();
    await screen.findByText("No icons yet.");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search icons" }), "zzz");
    expect(await screen.findByText("No icons match “zzz”.")).toBeInTheDocument();
    expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "newest", limit: 200, search: "zzz" });
  });
});

describe("search, sort and view", () => {
  it("sorts on the server and remembers the choice", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "name");
    await waitFor(() => expect(listIcons).toHaveBeenLastCalledWith("p1", expect.objectContaining({ sort: "name" })));
    expect(window.localStorage.getItem("iconSort")).toBe("name");
  });

  it("switches to the table view and remembers it", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("table", { name: "Icons" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Icons" });
    expect(table.parentElement).toHaveClass("min-h-0", "flex-1", "overflow-auto");
    expect(table.parentElement?.parentElement).toHaveClass("min-h-0", "flex-1", "flex");
    expect(table.parentElement?.parentElement).not.toHaveClass("pb-24");
    expect(window.localStorage.getItem("project:p1:iconView")).toBe("list");
  });

  it("shows a sprite ID column instead of size, tags, or updated", async () => {
    window.localStorage.setItem("project:p1:iconView", "list");
    listIcons.mockResolvedValue(reply([makeIcon({ id: "internal-record-id", name: "Chart", slug: "add-chart-element" })]));
    setup({ project: makeDetail({ id: "p1", prefix: "gunas" }) });

    const table = await screen.findByRole("table", { name: "Icons" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent?.trim())).toEqual(["Select", "Preview", "Name", "ID", "Folder"]);
    expect(within(table).getByText("gunas-add-chart-element")).toBeInTheDocument();
    expect(within(table).queryByText("internal-record-id")).not.toBeInTheDocument();
  });

  it("shows a codepoint column instead of ID in a font project", async () => {
    window.localStorage.setItem("project:p1:iconView", "list");
    listIcons.mockResolvedValue(reply([makeIcon({ id: "font-icon", name: "Glyph", codepoint: "E123" })]));
    setup({ project: makeDetail({ id: "p1", purpose: "font" }) });

    const table = await screen.findByRole("table", { name: "Icons" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent?.trim())).toEqual(["Select", "Preview", "Name", "Codepoint", "Folder"]);
    expect(within(table).getByText("U+E123")).toBeInTheDocument();
    expect(within(table).queryByText("font-icon")).not.toBeInTheDocument();
  });

  it("starts in the saved view and background", async () => {
    window.localStorage.setItem("project:p1:iconView", "list");
    window.localStorage.setItem("iconSurface", "dark");
    setup();
    expect(await screen.findByRole("table", { name: "Icons" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("show more", () => {
  it("asks for another 200 and keeps the selection", async () => {
    listIcons.mockResolvedValue(reply(three(), 450));
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(screen.queryByText(/^Showing \d+ of/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(listIcons).toHaveBeenLastCalledWith("p1", expect.objectContaining({ limit: 400 })));
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeChecked();
  });

  it("stops at the most the server returns and says how to narrow it down", async () => {
    listIcons.mockResolvedValue(reply(Array.from({ length: 1000 }, (_, i) => makeIcon({ id: `i${i}`, name: `N${i}` })), 1500));
    setup();
    await screen.findByRole("button", { name: "Open N0" });
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the first 1000 are shown/)).toBeInTheDocument();
  }, 60000);
});

describe("selection", () => {
  it("shows the bulk bar for a selection and clears it", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(screen.queryByRole("region", { name: "Selected icons" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    expect(screen.getByText("2 icons selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selected icons" })).not.toBeInTheDocument();
  });

  it("selects every icon shown", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all 3 shown" }));
    expect(screen.getByText("3 icons selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all 3 shown" }));
    expect(screen.queryByText("3 icons selected")).not.toBeInTheDocument();
  });

  it("hides Move and Tag in All Icons but keeps them available in a folder", async () => {
    const { rerender } = setup({ selectedFolder: "all" });
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));

    expect(screen.queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tag" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optimize" })).toBeInTheDocument();

    rerender({ selectedFolder: "ui" });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tag" })).toBeInTheDocument();
  });

  it("scopes select-all state and toggling to the current folder", async () => {
    const uiIcons = [
      makeIcon({ id: "ui-a", name: "UI Alpha", folderId: "ui" }),
      makeIcon({ id: "ui-b", name: "UI Beta", folderId: "ui" }),
    ];
    const assetIcons = [
      makeIcon({ id: "asset-a", name: "Asset Alpha", folderId: "assets" }),
      makeIcon({ id: "asset-b", name: "Asset Beta", folderId: "assets" }),
    ];
    listIcons.mockImplementation((_id, params = {}) => Promise.resolve(reply(params.folderId === "ui" ? uiIcons : assetIcons)));
    const { rerender } = setup({
      folderList: {
        folders: [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "assets", name: "Assets" })],
        uncategorizedCount: 0,
      },
      selectedFolder: "ui",
    });

    await screen.findByRole("button", { name: "Open UI Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select UI Alpha" }));
    expect(screen.getByRole("checkbox", { name: /select all 2 shown/i })).toHaveProperty("indeterminate", true);

    rerender({ selectedFolder: "assets" });
    await screen.findByRole("button", { name: "Open Asset Alpha" });
    const selectAll = screen.getByRole("checkbox", { name: /select all 2 shown/i });
    expect(selectAll).not.toBeChecked();
    expect(selectAll).toHaveProperty("indeterminate", false);

    await userEvent.click(selectAll);
    expect(screen.getByText("3 icons selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Asset Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Asset Beta" })).toBeChecked();

    await userEvent.click(selectAll);
    expect(screen.getByText("1 icon selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Asset Alpha" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Asset Beta" })).not.toBeChecked();

    rerender({ selectedFolder: "ui" });
    await screen.findByRole("button", { name: "Open UI Alpha" });
    expect(screen.getByRole("checkbox", { name: "Select UI Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /select all 2 shown/i })).toHaveProperty("indeterminate", true);
  });

  it("keeps the selection when the list is refreshed", async () => {
    const { rerender } = setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    expect(screen.getByText("1 icon selected")).toBeInTheDocument();
    rerender({ iconsVersion: 1 });
    // The selection survives a list refresh: nothing cleared it, so the bulk bar and the checkbox stay the same.
    expect(screen.getByText("1 icon selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeChecked();
  });

  it("keeps the selection when a refreshed list no longer contains the selected icons", async () => {
    const { rerender } = setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    expect(screen.getByText("2 icons selected")).toBeInTheDocument();
    // A list refresh by itself does not consume the selection.
    listIcons.mockResolvedValue(reply([makeIcon({ id: "c", name: "Gamma", hasStroke: true })]));
    rerender({ iconsVersion: 1 });
    await screen.findByRole("button", { name: "Open Gamma" });
    expect(screen.getByText("2 icons selected")).toBeInTheDocument();
  });

  it("offers only Download to a read-only viewer", async () => {
    setup({ project: makeDetail({ id: "p1", access: READ_ONLY }) });
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    const bar = screen.getByRole("region", { name: "Selected icons" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual(["Build sprite", "Download", "Clear selection"]);
    expect(screen.queryByRole("button", { name: "Upload icons" })).not.toBeInTheDocument();
  });

  it("drags the whole selection when a selected icon is dragged, and only itself otherwise", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    const drag = (name: string) => {
      const setData = vi.fn();
      fireEvent.dragStart(card(name), { dataTransfer: { setData, effectAllowed: "" } });
      return setData;
    };
    expect(drag("Alpha")).toHaveBeenCalledWith(DRAG_TYPE, JSON.stringify(["a", "b"]));
    expect(drag("Gamma")).toHaveBeenCalledWith(DRAG_TYPE, JSON.stringify(["c"]));
  });

  it("does not make cards draggable for a read-only viewer", async () => {
    setup({ project: makeDetail({ id: "p1", access: READ_ONLY }) });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(card("Alpha")).toHaveAttribute("draggable", "false");
  });
});

describe("bulk actions", () => {
  async function selectTwo() {
    const ctx = setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    return ctx;
  }
  const refreshed = (ctx: { refreshIcons: ReturnType<typeof vi.fn>; refreshFolders: ReturnType<typeof vi.fn>; refreshProject: ReturnType<typeof vi.fn> }) => {
    expect(ctx.refreshIcons).toHaveBeenCalled();
    expect(ctx.refreshFolders).toHaveBeenCalled();
    expect(ctx.refreshProject).toHaveBeenCalled();
  };
  const expectSelectionCleared = () => {
    expect(screen.queryByRole("region", { name: "Selected icons" })).not.toBeInTheDocument();
    const selectAll = screen.getByRole("checkbox", { name: "Select all 3 shown" });
    expect(selectAll).not.toBeChecked();
    expect(selectAll).toHaveProperty("indeterminate", false);
  };

  it("clears the bulk bar and select-all checkbox after a successful action", async () => {
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValue({ requested: 3, matched: 3, optimized: 3, bytesBefore: 300, bytesAfter: 150, failed: [] });
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    const selectAll = screen.getByRole("checkbox", { name: "Select all 3 shown" });
    await userEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByRole("region", { name: "Selected icons" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));

    expect(await screen.findByText("Optimized 3 of 3 icons, 50% smaller.")).toBeInTheDocument();
    expectSelectionCleared();
  });

  it("moves the selection to a folder", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockResolvedValue({ requested: 2, matched: 2 });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    const dialog = screen.getByRole("dialog", { name: "Move 2 icons" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Move into"), "ui");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(iconsApi.batchMoveIcons).toHaveBeenCalledWith("p1", ["a", "b"], "ui");
    expect(await screen.findByText("Moved 2 icons.")).toBeInTheDocument();
    expectSelectionCleared();
    refreshed(ctx);
  });

  it("tags the selection", async () => {
    vi.mocked(iconsApi.batchTagIcons).mockResolvedValue({ requested: 2, matched: 2 });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Tag" }));
    await userEvent.type(screen.getByLabelText("Tags"), "brand");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(iconsApi.batchTagIcons).toHaveBeenCalledWith("p1", ["a", "b"], ["brand"], "add");
    expect(await screen.findByText("Updated tags on 2 icons.")).toBeInTheDocument();
    expectSelectionCleared();
    refreshed(ctx);
  });

  it("optimizes and reports the saving", async () => {
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValue({ requested: 2, matched: 2, optimized: 2, bytesBefore: 1000, bytesAfter: 600, failed: [] });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("Optimized 2 of 2 icons, 40% smaller.")).toBeInTheDocument();
    expectSelectionCleared();
    refreshed(ctx);
  });

  it("says so when nothing could be made smaller, and when some failed", async () => {
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValueOnce({ requested: 2, matched: 2, optimized: 0, bytesBefore: 100, bytesAfter: 100, failed: [] });
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("They are already as small as they can be.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValueOnce({ requested: 2, matched: 2, optimized: 1, bytesBefore: 100, bytesAfter: 90, failed: [{ id: "b", message: "x" }] });
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("1 icon could not be optimized.")).toBeInTheDocument();
    expectSelectionCleared();
  });

  it("downloads the selection", async () => {
    const blob = new Blob(["z"]);
    vi.mocked(iconsApi.downloadIcons).mockResolvedValue({ blob, filename: "icons.zip" });
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(iconsApi.downloadIcons).toHaveBeenCalledWith("p1", ["a", "b"]);
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "icons.zip"));
    expectSelectionCleared();
  });

  it("asks before moving to the trash, then offers Undo", async () => {
    vi.mocked(iconsApi.batchDeleteIcons).mockResolvedValue({ requested: 2, matched: 2 });
    vi.mocked(iconsApi.batchRestoreIcons).mockResolvedValue({ requested: 2, matched: 2, adjusted: [] });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Move 2 icons to the trash?" });
    expect(iconsApi.batchDeleteIcons).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move to trash" }));
    expect(iconsApi.batchDeleteIcons).toHaveBeenCalledWith("p1", ["a", "b"]);
    expect(await screen.findByText("Moved 2 icons to the trash.")).toBeInTheDocument();
    expectSelectionCleared();
    ctx.refreshIcons.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(iconsApi.batchRestoreIcons).toHaveBeenCalledWith("p1", ["a", "b"]);
    await waitFor(() => expect(ctx.refreshIcons).toHaveBeenCalled());
  });

  it("reports a failed action as a message", async () => {
    vi.mocked(iconsApi.downloadIcons).mockRejectedValue(new ApiError("No matching icons found.", 404));
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("No matching icons found.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected icons" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Alpha" })).toBeChecked();
  });

  it("keeps the dialog open and shows the reason when a move fails", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockRejectedValue(new ApiError("That folder does not exist in this project.", 400));
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Move" }));
    expect(await within(screen.getByRole("dialog")).findByText("That folder does not exist in this project.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected icons" })).toBeInTheDocument();
  });
});

describe("building a sprite or a font from the selection", () => {
  const withIcons = () => listIcons.mockResolvedValue(reply(three()));
  const state = () => JSON.parse(screen.getByTestId("where").getAttribute("data-state") as string);
  const builtFont = (isNew = true) => ({ fontName: "feather", prefix: "feather", iconCount: 2, warnings: [], css: "x", preview: { format: "woff2" as const, base64: "AA==" }, sizes: { woff2: 100 }, codepoints: [{ id: "a", name: "Alpha", slug: "alpha", codepoint: "E001", className: "feather-alpha", isNew }] });
  const fontProject = () => ({ project: makeDetail({ id: "p1", name: "Feather Icons", prefix: "feather", purpose: "font" }) });

  beforeEach(() => {
    clearCachedBuild();
    vi.mocked(preview.loadPreviewFont).mockResolvedValue(true);
    vi.mocked(fontsApi.buildFont).mockResolvedValue(builtFont());
  });

  it("a sprite project goes straight to the Sprite page with the selected icons, and shows no popup on the way", async () => {
    withIcons();
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Gamma" }));
    await userEvent.click(screen.getByRole("button", { name: "Build sprite" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1/sprite"));
    expect(state()).toEqual({ iconIds: ["a", "c"] });
    expect(screen.queryByRole("region", { name: "Selected icons" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fontsApi.buildFont).not.toHaveBeenCalled();
  });

  it("a font project builds the font from the selection with the usual settings, then opens the Font page with the result waiting", async () => {
    withIcons();
    setup(fontProject());
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    await userEvent.click(screen.getByRole("button", { name: "Build font" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1/font"));
    expect(fontsApi.buildFont).toHaveBeenCalledTimes(1);
    expect(fontsApi.buildFont).toHaveBeenCalledWith("p1", { scope: "selected", iconIds: ["a", "b"], formats: ["woff2", "woff", "ttf"], fontName: "FeatherIcons", prefix: "feather", baseClass: "", startCodepoint: "E001", fontHeight: 1000, descent: 0, normalize: true });
    expect(state()).toEqual({ iconIds: ["a", "b"], built: true });
    expect(screen.queryByRole("region", { name: "Selected icons" })).not.toBeInTheDocument();
    expect(peekCachedBuild("p1")?.build.fontName).toBe("feather");
    expect(preview.loadPreviewFont).toHaveBeenCalledWith(expect.stringMatching(/^iconfont-preview-/), "AA==");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays on the Icons screen and shows the reason when the font cannot be built", async () => {
    withIcons();
    vi.mocked(fontsApi.buildFont).mockRejectedValue(new ApiError("These icons have a character outside E000 to F8FF: Alpha (F0001).", 400));
    setup(fontProject());
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Build font" }));
    expect(await screen.findByText(/outside E000 to F8FF/)).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("/projects/p1");
    expect(peekCachedBuild("p1")).toBeNull();
    expect(screen.getByText("1 icon selected")).toBeInTheDocument();
  });

  it("shows that it is working, and blocks the other actions, while the font builds", async () => {
    withIcons();
    let finish: (value: ReturnType<typeof builtFont>) => void = () => undefined;
    vi.mocked(fontsApi.buildFont).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup(fontProject());
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Build font" }));
    expect(screen.getByRole("button", { name: "Build font" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    finish(builtFont());
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1/font"));
  });

  it("refreshes the lists when the build saved new characters on the icons, but not for a viewer", async () => {
    withIcons();
    const fns = setup(fontProject());
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Build font" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1/font"));
    expect(fns.refreshIcons).toHaveBeenCalled();
    expect(fns.refreshProject).toHaveBeenCalled();
  });

  it("does not refresh anything for a read-only viewer, who can still build", async () => {
    withIcons();
    const fns = setup({ project: makeDetail({ id: "p1", prefix: "feather", purpose: "font", access: READ_ONLY }) });
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Build font" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1/font"));
    expect(fns.refreshIcons).not.toHaveBeenCalled();
  });
});

describe("opening an icon", () => {
  it("opens the drawer for the clicked icon", async () => {
    vi.mocked(iconsApi.getIcon).mockResolvedValue({ ...makeIcon({ id: "b", name: "Beta", slug: "beta" }), svg: "<svg viewBox='0 0 1 1'/>", versions: [] });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Open Beta" }));
    expect(iconsApi.getIcon).toHaveBeenCalledWith("b");
    expect(await screen.findByRole("heading", { level: 3, name: "Beta" })).toBeInTheDocument();
    expect(screen.getByText("feather-beta")).toBeInTheDocument();
  });

  it("opens from the table view too", async () => {
    window.localStorage.setItem("project:p1:iconView", "list");
    vi.mocked(iconsApi.getIcon).mockResolvedValue({ ...makeIcon({ id: "a", name: "Alpha", slug: "alpha" }), svg: "<svg viewBox='0 0 1 1'/>", versions: [] });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Alpha" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Alpha" })).toBeInTheDocument();
  });
});
