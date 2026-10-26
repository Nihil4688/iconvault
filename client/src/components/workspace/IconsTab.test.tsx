// Tests for the Icons section: loading and empty states, what is asked of the server for each folder, search and sort, views, "show more", selection, every bulk action (with undo for trash), read-only behaviour, failures, and opening an icon.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as fontsApi from "../../api/fonts";
import * as iconsApi from "../../api/icons";
import { ToastProvider } from "../../context/ToastContext";
import { WorkspaceContext, type WorkspaceContextValue } from "../../context/workspaceContext";
import { DRAG_TYPE } from "../../lib/dragIcons";
import { clearCachedBuild, peekCachedBuild } from "../../lib/fontBuildCache";
import * as preview from "../../lib/fontPreview";
import { READ_ONLY, makeDetail, makeFolder, makeIcon } from "../../test/fixtures";
import * as zip from "../../utils/zipBundle";
import IconsTab from "./IconsTab";

vi.mock("../ui/SvgPreview", () => ({ default: () => null }));
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

function setup(over: Partial<WorkspaceContextValue> = {}) {
  const fns = { selectFolder: vi.fn(), refreshProject: vi.fn(), refreshFolders: vi.fn(), refreshIcons: vi.fn() };
  const value: WorkspaceContextValue = {
    project: makeDetail({ id: "p1", prefix: "feather", iconCount: 3 }),
    folderList: { folders: [makeFolder({ id: "ui", name: "UI" })], uncategorizedCount: 0 },
    selectedFolder: "all",
    iconsVersion: 0,
    ...fns,
    ...over,
  };
  const view = render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <ToastProvider>
        <WorkspaceContext.Provider value={value}>
          <IconsTab />
        </WorkspaceContext.Provider>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
  const rerender = (next: Partial<WorkspaceContextValue>) =>
    view.rerender(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <ToastProvider>
          <WorkspaceContext.Provider value={{ ...value, ...next }}>
            <IconsTab />
          </WorkspaceContext.Provider>
        </ToastProvider>
      </MemoryRouter>,
    );
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
    expect(within(card("Gamma")).getByText("Stroke")).toBeInTheDocument();
  });

  it("asks for the newest first, 200 at a time, for the whole project", async () => {
    setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenCalledWith("p1", { sort: "newest", limit: 200 });
  });

  it("asks for a folder and its subfolders, or only the project root", async () => {
    const { unmount } = render(<span />);
    unmount();
    setup({ selectedFolder: "ui" });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "newest", limit: 200, folderId: "ui", includeSubfolders: true });
  });

  it("asks for uncategorized icons without subfolders", async () => {
    setup({ selectedFolder: "root" });
    await screen.findByRole("button", { name: "Open Alpha" });
    expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "newest", limit: 200, folderId: "root", includeSubfolders: false });
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
    await userEvent.click(screen.getAllByRole("button", { name: "Upload icons" })[1] as HTMLElement);
    expect(screen.getByRole("dialog", { name: "Add icons" })).toBeInTheDocument();
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
    setup({ selectedFolder: "ui" });
    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
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
    expect(window.localStorage.getItem("iconView")).toBe("list");
  });

  it("starts in the saved view and background", async () => {
    window.localStorage.setItem("iconView", "list");
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

  it("starts again after the list is refreshed", async () => {
    const { rerender } = setup();
    await screen.findByRole("button", { name: "Open Alpha" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    expect(screen.getByText("1 icon selected")).toBeInTheDocument();
    rerender({ iconsVersion: 1 });
    await waitFor(() => expect(screen.queryByText("1 icon selected")).not.toBeInTheDocument());
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

  it("moves the selection to a folder", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockResolvedValue({ requested: 2, matched: 2 });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    const dialog = screen.getByRole("dialog", { name: "Move 2 icons" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Move into"), "ui");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(iconsApi.batchMoveIcons).toHaveBeenCalledWith("p1", ["a", "b"], "ui");
    expect(await screen.findByText("Moved 2 icons.")).toBeInTheDocument();
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
    refreshed(ctx);
  });

  it("optimizes and reports the saving", async () => {
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValue({ requested: 2, matched: 2, optimized: 2, bytesBefore: 1000, bytesAfter: 600, failed: [] });
    const ctx = await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("Optimized 2 of 2 icons, 40% smaller.")).toBeInTheDocument();
    refreshed(ctx);
  });

  it("says so when nothing could be made smaller, and when some failed", async () => {
    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValueOnce({ requested: 2, matched: 2, optimized: 0, bytesBefore: 100, bytesAfter: 100, failed: [] });
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("They are already as small as they can be.")).toBeInTheDocument();

    vi.mocked(iconsApi.batchOptimizeIcons).mockResolvedValueOnce({ requested: 2, matched: 2, optimized: 1, bytesBefore: 100, bytesAfter: 90, failed: [{ id: "b", message: "x" }] });
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("1 icon could not be optimized.")).toBeInTheDocument();
  });

  it("downloads the selection", async () => {
    const blob = new Blob(["z"]);
    vi.mocked(iconsApi.downloadIcons).mockResolvedValue({ blob, filename: "icons.zip" });
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(iconsApi.downloadIcons).toHaveBeenCalledWith("p1", ["a", "b"]);
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "icons.zip"));
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
  });

  it("keeps the dialog open and shows the reason when a move fails", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockRejectedValue(new ApiError("That folder does not exist in this project.", 400));
    await selectTwo();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Move" }));
    expect(await within(screen.getByRole("dialog")).findByText("That folder does not exist in this project.")).toBeInTheDocument();
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
    window.localStorage.setItem("iconView", "list");
    vi.mocked(iconsApi.getIcon).mockResolvedValue({ ...makeIcon({ id: "a", name: "Alpha", slug: "alpha" }), svg: "<svg viewBox='0 0 1 1'/>", versions: [] });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Alpha" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Alpha" })).toBeInTheDocument();
  });
});
