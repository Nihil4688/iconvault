// Tests for the Font section: building with the chosen options, validation before sending, the preview and the character list, warnings, copy, download, permissions and errors.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fontsApi from "../../api/fonts";
import * as iconsApi from "../../api/icons";
import { ApiError } from "../../api/http";
import type { FontBuildResult } from "../../api/types";
import { ToastProvider } from "../../context/ToastContext";
import { WorkspaceContext, type WorkspaceContextValue } from "../../context/workspaceContext";
import * as clipboard from "../../lib/clipboard";
import { cacheBuild, clearCachedBuild, peekCachedBuild } from "../../lib/fontBuildCache";
import { fontAutoBuild } from "../../lib/fontAutoBuild";
import * as preview from "../../lib/fontPreview";
import { READ_ONLY, makeDetail, makeFolder, makeIcon } from "../../test/fixtures";
import * as zip from "../../utils/zipBundle";
import FontTab from "./FontTab";

vi.mock("../../api/fonts");
vi.mock("../../api/icons");
vi.mock("../../lib/clipboard");
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));
vi.mock("../../lib/fontPreview", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/fontPreview")>()), loadPreviewFont: vi.fn(), unloadPreviewFont: vi.fn() }));

const buildFont = vi.mocked(fontsApi.buildFont);
const built = (over: Partial<FontBuildResult> = {}): FontBuildResult => ({
  fontName: "Feather",
  prefix: "fth",
  iconCount: 2,
  warnings: [],
  css: '@font-face { font-family: Feather; src: url("Feather.woff2") format("woff2"); }',
  preview: { format: "woff2", base64: "d09GMg==" },
  sizes: { woff2: 1200, ttf: 3400 },
  codepoints: [
    { id: "a", name: "Home", slug: "home", codepoint: "E001", className: "fth-home", isNew: true },
    { id: "b", name: "Star", slug: "star", codepoint: "E002", className: "fth-star", isNew: false },
  ],
  ...over,
});

function setup(over: Partial<WorkspaceContextValue> = {}, state?: unknown) {
  const fns = { selectFolder: vi.fn(), refreshProject: vi.fn(), refreshFolders: vi.fn(), refreshIcons: vi.fn() };
  const value: WorkspaceContextValue = {
    project: makeDetail({ id: "p1", name: "Feather Icons", prefix: "fth", purpose: "font", iconCount: 2 }),
    folderList: { folders: [makeFolder({ id: "ui", name: "UI", iconCount: 3 })], uncategorizedCount: 0 },
    selectedFolder: "all",
    iconsVersion: 0,
    ...fns,
    ...over,
  };
  render(
    <MemoryRouter initialEntries={[{ pathname: "/projects/p1", state }]}>
      <ToastProvider>
        <WorkspaceContext.Provider value={value}>
          <FontTab />
        </WorkspaceContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return fns;
}

// The font builds by itself on this page. Tests wait for that (a short delay), or switch it off to look at the page before any build.
const builtAutomatically = () => waitFor(() => expect(buildFont).toHaveBeenCalled());

beforeEach(() => {
  fontAutoBuild.enabled = true;
  fontAutoBuild.delayMs = 30;
  vi.resetAllMocks();
  vi.mocked(clipboard.copyText).mockResolvedValue(true);
  vi.mocked(preview.loadPreviewFont).mockResolvedValue(true);
  buildFont.mockResolvedValue(built());
  vi.mocked(fontsApi.listFontBuilds).mockResolvedValue([]);
});

describe("building", () => {
  it("starts from the project's name and prefix with the usual formats", () => {
    setup();
    expect(screen.getByLabelText("Font name")).toHaveValue("FeatherIcons");
    expect(screen.getByLabelText("Class prefix")).toHaveValue("fth");
    expect(screen.getByLabelText("Starting codepoint (hex)")).toHaveValue("E001");
    expect(screen.getByLabelText("WOFF2")).toBeChecked();
    expect(screen.getByLabelText("TTF")).toBeChecked();
    expect(screen.getByLabelText("EOT")).not.toBeChecked();
  });

  it("sends the options, then shows the count, sizes and every character", async () => {
    setup();
    await builtAutomatically();
    expect(buildFont).toHaveBeenCalledWith("p1", { scope: "all", formats: ["woff2", "woff", "ttf"], fontName: "FeatherIcons", prefix: "fth", baseClass: "", startCodepoint: "E001", fontHeight: 1000, descent: 0, normalize: true });
    expect(await screen.findByText("2 icons")).toBeInTheDocument();
    expect(await screen.findByText("Font generated successfully.", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/WOFF2 1\.2 KB, TTF 3\.3 KB/)).toBeInTheDocument();
    // One table lists every glyph: character, CSS entity, class. There is no second grid repeating the same icons.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Characters" })).not.toBeInTheDocument();
    const home = screen.getByRole("button", { name: "Copy class fth-home" }).closest("tr") as HTMLElement;
    expect(within(home).getByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E001");
    expect(within(home).getByText("\\e001")).toBeInTheDocument();
    expect(within(home).getByText("new")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Copy class fth-star" }).closest("tr") as HTMLElement).queryByText("new")).not.toBeInTheDocument();
    expect(preview.loadPreviewFont).toHaveBeenCalledWith(expect.stringMatching(/^iconfont-preview-/), "d09GMg==");
  });

  it("rebases every glyph when the starting codepoint changes and uses the rebased values for downloads", async () => {
    setup();
    await builtAutomatically();
    buildFont.mockResolvedValue(built({
      codepoints: [
        { id: "a", name: "Home", slug: "home", codepoint: "E100", className: "fth-home", isNew: true },
        { id: "b", name: "Star", slug: "star", codepoint: "E101", className: "fth-star", isNew: true },
      ],
      css: '@font-face { font-family: Feather; src: url("Feather.woff2") format("woff2"); } .fth-home:before { content: "\\e100"; }',
    }));
    await userEvent.clear(screen.getByLabelText("Starting codepoint (hex)"));
    await userEvent.type(screen.getByLabelText("Starting codepoint (hex)"), "E100");

    await waitFor(() => expect(buildFont).toHaveBeenLastCalledWith("p1", expect.objectContaining({ startCodepoint: "E100", reassignCodepoints: true })));
    expect(await screen.findByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E100");
    expect(screen.getByRole("textbox", { name: "Codepoint for Star" })).toHaveValue("E101");
    expect(screen.getByText("\\e100")).toBeInTheDocument();

    vi.mocked(fontsApi.downloadFont).mockResolvedValue({ blob: new Blob(["rebased"]), filename: "Rebased.zip" });
    await userEvent.click(screen.getByRole("button", { name: "Download font" }));
    await waitFor(() => expect(fontsApi.downloadFont).toHaveBeenCalledWith("p1", expect.objectContaining({ startCodepoint: "E100" })));
    expect(fontsApi.downloadFont).toHaveBeenLastCalledWith("p1", expect.not.objectContaining({ reassignCodepoints: true }));
  });

  it("keeps the rebasing option for viewers so their download matches the preview", async () => {
    setup({ project: makeDetail({ id: "p1", purpose: "font", iconCount: 2, access: READ_ONLY }) });
    await builtAutomatically();
    buildFont.mockResolvedValue(built({
      codepoints: [
        { id: "a", name: "Home", slug: "home", codepoint: "E100", className: "fth-home", isNew: true },
        { id: "b", name: "Star", slug: "star", codepoint: "E101", className: "fth-star", isNew: true },
      ],
    }));
    await userEvent.clear(screen.getByLabelText("Starting codepoint (hex)"));
    await userEvent.type(screen.getByLabelText("Starting codepoint (hex)"), "E100");

    await waitFor(() => expect(buildFont).toHaveBeenLastCalledWith("p1", expect.objectContaining({ startCodepoint: "E100", reassignCodepoints: true })));
    vi.mocked(fontsApi.downloadFont).mockResolvedValue({ blob: new Blob(["rebased"]), filename: "Rebased.zip" });
    await userEvent.click(screen.getByRole("button", { name: "Download font" }));
    expect(fontsApi.downloadFont).toHaveBeenCalledWith("p1", expect.objectContaining({ startCodepoint: "E100", reassignCodepoints: true }));
  });

  it("sends a folder, other formats and advanced values as chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Selected folder" }));
    await userEvent.selectOptions(screen.getByLabelText("Folder"), "ui");
    await userEvent.clear(screen.getByLabelText("Font name"));
    await userEvent.type(screen.getByLabelText("Base class"), "fth");
    await userEvent.type(screen.getByLabelText("Font name"), "Mine");
    await userEvent.click(screen.getByLabelText("WOFF"));
    await userEvent.click(screen.getByLabelText("EOT"));
    await userEvent.clear(screen.getByLabelText("Starting codepoint (hex)"));
    await userEvent.type(screen.getByLabelText("Starting codepoint (hex)"), "e100");
    await userEvent.clear(screen.getByLabelText("Font height"));
    await userEvent.type(screen.getByLabelText("Font height"), "1200");
    await userEvent.click(screen.getByLabelText("Normalize glyph bounds to height"));
    await waitFor(() => expect(buildFont).toHaveBeenLastCalledWith("p1", { scope: "folder", folderId: "ui", formats: ["woff2", "ttf", "eot"], fontName: "Mine", prefix: "fth", baseClass: "fth", startCodepoint: "E100", reassignCodepoints: true, fontHeight: 1200, descent: 0, normalize: false }));
  });

  it("waits, without a message, while an option is not valid, and builds once it is", async () => {
    setup();
    await builtAutomatically();
    buildFont.mockClear();
    await userEvent.clear(screen.getByLabelText("Starting codepoint (hex)"));
    await userEvent.type(screen.getByLabelText("Starting codepoint (hex)"), "zz");
    for (const format of ["WOFF2", "WOFF", "TTF"]) await userEvent.click(screen.getByLabelText(format));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(buildFont).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Starting codepoint (hex)"));
    await userEvent.type(screen.getByLabelText("Starting codepoint (hex)"), "E001");
    await userEvent.click(screen.getByLabelText("TTF"));
    await waitFor(() => expect(buildFont).toHaveBeenLastCalledWith("p1", expect.objectContaining({ formats: ["ttf"], startCodepoint: "E001" })));
  });

  it("shows the server's reason when the build fails", async () => {
    buildFont.mockRejectedValue(new ApiError("There are no icons to put in the font.", 400));
    setup();
    await builtAutomatically();
    expect(await screen.findByRole("alert")).toHaveTextContent("There are no icons to put in the font.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists conversion warnings", async () => {
    buildFont.mockResolvedValue(built({ warnings: [{ icon: "Line", message: "Uses strokes." }] }));
    setup();
    await builtAutomatically();
    expect(await screen.findByText(/1 icon warning/)).toBeInTheDocument();
    expect(screen.getByText("Uses strokes.", { exact: false })).toBeInTheDocument();
  });

  it("says when the browser could not load the preview font", async () => {
    vi.mocked(preview.loadPreviewFont).mockResolvedValue(false);
    setup();
    await builtAutomatically();
    expect(await screen.findByRole("note")).toHaveTextContent("could not load the preview font");
  });

  it("refreshes the icon lists when new characters were saved, but not for a viewer", async () => {
    const fns = setup();
    await builtAutomatically();
    await screen.findByText("2 icons");
    expect(fns.refreshIcons).toHaveBeenCalled();
  });

  it("does not refresh anything for a read-only viewer, and explains that characters are not saved", async () => {
    const fns = setup({ project: makeDetail({ id: "p1", purpose: "font", iconCount: 2, access: READ_ONLY }) });
    expect(screen.getByText(/characters are not saved/)).toBeInTheDocument();
    await builtAutomatically();
    await screen.findByText("2 icons");
    expect(fns.refreshIcons).not.toHaveBeenCalled();
  });
});

describe("the codepoint mapping table", () => {
  const rebuilt = (codepoint: string) => built({ codepoints: [{ id: "a", name: "Home", slug: "home", codepoint, className: "fth-home", isNew: false }, { id: "b", name: "Star", slug: "star", codepoint: "E002", className: "fth-star", isNew: false }] });
  const open = async (over: Partial<WorkspaceContextValue> = {}) => {
    const fns = setup(over);
    await builtAutomatically();
    await screen.findByRole("table", { name: "Stable Unicode codepoints mapping" });
    return fns;
  };

  it("lists every glyph of the build with its character and CSS entity", async () => {
    await open();
    const table = screen.getByRole("table", { name: "Stable Unicode codepoints mapping" });
    expect(within(table).getByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E001");
    expect(within(table).getByText("\\e001")).toBeInTheDocument();
    expect(within(table).getByText("\\e002")).toBeInTheDocument();
  });

  it("saves a new character on the icon, rebuilds with the same options, and shows the new value in the table, the grid and the stylesheet", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue(makeIcon({ id: "a", codepoint: "E701" }) as never);
    const fns = await open();
    buildFont.mockClear();
    buildFont.mockResolvedValue(rebuilt("E701"));
    const home = screen.getByRole("textbox", { name: "Codepoint for Home" });
    await userEvent.clear(home);
    await userEvent.type(home, "e701{Enter}");
    await waitFor(() => expect(iconsApi.updateIcon).toHaveBeenCalledWith("a", { codepoint: "E701" }));
    await waitFor(() => expect(buildFont).toHaveBeenCalledTimes(1));
    expect(buildFont).toHaveBeenCalledWith("p1", expect.objectContaining({ fontName: "FeatherIcons", formats: ["woff2", "woff", "ttf"] }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E701"));
    expect(screen.getByText("\\e701")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy class fth-home" }).closest("tr")).toHaveTextContent("\\e701");
    expect(await screen.findByText("Home now uses U+E701. Rebuilding the font.")).toBeInTheDocument();
    expect(fns.refreshIcons).toHaveBeenCalled();
  });

  it("downloads and copies the rebuilt output, not the old one", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue(makeIcon({ id: "a" }) as never);
    vi.mocked(fontsApi.downloadFont).mockResolvedValue({ blob: new Blob(["z"]), filename: "x.zip" });
    await open();
    buildFont.mockResolvedValue({ ...rebuilt("E701"), css: '@font-face { font-family: Feather; src: url("Feather.woff2") format("woff2"); }\n.fth-home:before { content: "\\e701"; }' });
    const home = screen.getByRole("textbox", { name: "Codepoint for Home" });
    await userEvent.clear(home);
    await userEvent.type(home, "E701{Enter}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E701"));
    await userEvent.click(screen.getByRole("button", { name: "Copy CSS" }));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining("\\e701"));
    await userEvent.click(screen.getByRole("button", { name: "Download font" }));
    expect(fontsApi.downloadFont).toHaveBeenCalledTimes(1);
  });

  it("shows the server's reason beside the box when another icon already has the character, and does not rebuild", async () => {
    vi.mocked(iconsApi.updateIcon).mockRejectedValue(new ApiError('Codepoint E002 is already used by "Star".', 409));
    await open();
    buildFont.mockClear();
    const home = screen.getByRole("textbox", { name: "Codepoint for Home" });
    await userEvent.clear(home);
    await userEvent.type(home, "E002{Enter}");
    expect(await screen.findByText(/already used by "Star"/)).toBeInTheDocument();
    expect(buildFont).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Codepoint for Home" })).toHaveValue("E002");
  });

  it("does not send an invalid value to the server", async () => {
    await open();
    const home = screen.getByRole("textbox", { name: "Codepoint for Home" });
    await userEvent.clear(home);
    await userEvent.type(home, "0041{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("E000 to F8FF");
    expect(iconsApi.updateIcon).not.toHaveBeenCalled();
  });

  it("clears a character with an empty box", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue(makeIcon({ id: "a" }) as never);
    await open();
    const home = screen.getByRole("textbox", { name: "Codepoint for Home" });
    await userEvent.clear(home);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(iconsApi.updateIcon).toHaveBeenCalledWith("a", { codepoint: null }));
    expect(await screen.findByText("Cleared the character of Home. Rebuilding the font.")).toBeInTheDocument();
  });

  it("is read-only for people who cannot edit the project", async () => {
    await open({ project: makeDetail({ id: "p1", purpose: "font", iconCount: 2, access: READ_ONLY }) });
    const table = screen.getByRole("table", { name: "Stable Unicode codepoints mapping" });
    expect(within(table).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(table).getByText("U+E001")).toBeInTheDocument();
  });
});

describe("a font built on the Icons screen", () => {
  beforeEach(() => clearCachedBuild());

  it("opens already built: the table and the sizes are there, and the page does not build it again", async () => {
    cacheBuild({ projectId: "p1", build: built(), family: "iconfont-preview-77", loaded: true });
    setup({}, { iconIds: ["a", "b"], built: true });
    expect(await screen.findByRole("table", { name: "Stable Unicode codepoints mapping" })).toBeInTheDocument();
    expect(await screen.findByText("Font generated successfully.", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/WOFF2 1\.2 KB, TTF 3\.3 KB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy CSS" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Selected icons (2)" })).toBeInTheDocument();
    expect(buildFont).not.toHaveBeenCalled();
    // The page makes sure the preview font is registered, so the glyph previews draw even if it was removed in between.
    expect(preview.loadPreviewFont).toHaveBeenCalledWith("iconfont-preview-77", "d09GMg==");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("takes the waiting build, so it is not shown again on a later visit", async () => {
    cacheBuild({ projectId: "p1", build: built(), family: "iconfont-preview-78", loaded: true });
    setup({}, { iconIds: ["a", "b"], built: true });
    await screen.findByRole("table", { name: "Stable Unicode codepoints mapping" });
    await waitFor(() => expect(peekCachedBuild("p1")).toBeNull());
  });

  it("starts unbuilt when the waiting build belongs to another project or is gone (after a reload)", () => {
    cacheBuild({ projectId: "other", build: built(), family: "iconfont-preview-79", loaded: true });
    setup({}, { iconIds: ["a", "b"], built: true });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (2)" })).toBeInTheDocument();
  });

  it("lets the person download it straight away as the main action", async () => {
    cacheBuild({ projectId: "p1", build: built(), family: "iconfont-preview-80", loaded: true });
    const blob = new Blob(["z"]);
    vi.mocked(fontsApi.downloadFont).mockResolvedValue({ blob, filename: "FeatherIcons-font.zip" });
    setup({}, { iconIds: ["a", "b"], built: true });
    await userEvent.click(await screen.findByRole("button", { name: "Download font" }));
    expect(fontsApi.downloadFont).toHaveBeenCalledWith("p1", expect.objectContaining({ scope: "selected", iconIds: ["a", "b"] }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "FeatherIcons-font.zip"));
  });
});

describe("the page layout", () => {
  it("puts the actions at the top, with Copy CSS beside Build font, and groups the controls in titled sections", () => {
    setup();
    const actions = screen.getByRole("group", { name: "Font actions" });
    // There is no Build font button: the font builds by itself.
    expect(within(actions).getAllByRole("button").map((b) => b.textContent)).toEqual(["Download font", "Copy CSS"]);
    expect(screen.queryByRole("button", { name: "Build font" })).not.toBeInTheDocument();
    // Download font is the main (filled) action.
    expect(within(actions).getByRole("button", { name: "Download font" }).className.split(" ")).toContain("bg-primary");
    for (const title of ["1. Scope selection", "2. Font & CSS settings", "3. Font metrics & normalization"]) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Target formats" })).toBeInTheDocument();
    // The actions come before the columns in the page.
    expect(actions.compareDocumentPosition(screen.getByRole("region", { name: "1. Scope selection" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Download font off until the font is built", async () => {
    setup();
    const download = screen.getByRole("button", { name: "Download font" });
    expect(download).toBeDisabled();
    expect(screen.queryByText(/Build the font first/)).not.toBeInTheDocument();
    await builtAutomatically();
    await screen.findByText("2 icons");
    expect(download).toBeEnabled();
    expect(fontsApi.downloadFont).not.toHaveBeenCalled();
  });

  it("has no heading or intro text on the left of the actions", () => {
    setup();
    expect(screen.queryByRole("heading", { name: "Icon font" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Every icon becomes one character/)).not.toBeInTheDocument();
  });

  it("puts the actions into the project bar when there is one", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    setup({ actionsSlot: slot });
    expect(within(slot).getByRole("group", { name: "Font actions" })).toBeInTheDocument();
    expect(within(slot).getByRole("button", { name: "Download font" })).toBeInTheDocument();
    slot.remove();
  });

  it("has Copy CSS switched off until there is a build", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Copy CSS" })).toBeDisabled();
    await builtAutomatically();
    await screen.findByText("2 icons");
    expect(screen.getByRole("button", { name: "Copy CSS" })).toBeEnabled();
  });

  it("says how many icons will be compiled for all, a folder or a choice", async () => {
    setup({ project: makeDetail({ id: "p1", prefix: "fth", purpose: "font", iconCount: 9 }), folderList: { folders: [makeFolder({ id: "ui", name: "UI", iconCount: 4 })], uncategorizedCount: 5 } });
    const scope = screen.getByRole("region", { name: "1. Scope selection" });
    expect(within(scope).getByRole("radio", { name: "Whole project (9 icons)" })).toBeChecked();
    expect(within(scope).getByText("9 / 9")).toBeInTheDocument();
    await userEvent.click(within(scope).getByRole("radio", { name: "Selected folder" }));
    await userEvent.selectOptions(within(scope).getByLabelText("Folder"), "ui");
    expect(within(scope).getByText("4 / 9")).toBeInTheDocument();
  });

  it("has three columns like Icon Vault, with the font metrics always visible", () => {
    setup();
    const css = screen.getByRole("region", { name: "2. Font & CSS settings" });
    for (const label of ["Font name", "Class prefix", "Base class", "Starting codepoint (hex)"]) expect(within(css).getByLabelText(label)).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "3. Font metrics & normalization" });
    for (const label of ["Font height", "Descent", "Normalize glyph bounds to height"]) expect(within(metrics).getByLabelText(label)).toBeVisible();
    expect(screen.queryByText("Advanced")).not.toBeInTheDocument();
  });

  it("does not build a folder scope before a folder is chosen, nor with a bad base class", async () => {
    setup();
    await builtAutomatically();
    buildFont.mockClear();
    await userEvent.click(screen.getByRole("radio", { name: "Selected folder" }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(buildFont).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: /^Whole project/ }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    buildFont.mockClear();
    await userEvent.type(screen.getByLabelText("Base class"), "9bad");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(buildFont).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the checklist when Selected icons is picked with nothing chosen yet", async () => {
    vi.mocked(iconsApi.listIcons).mockResolvedValue({ icons: [makeIcon({ id: "a", name: "Home", slug: "home" })], total: 1, page: 1, limit: 1000 });
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Selected icons (0)" }));
    expect(await screen.findByRole("dialog", { name: "Choose icons for the font" })).toBeInTheDocument();
  });

  it("copies a class with the base class in front when there is one", async () => {
    buildFont.mockResolvedValue(built({ baseClass: "fth" }));
    setup();
    await builtAutomatically();
    await userEvent.click(await screen.findByRole("button", { name: "Copy class fth-home" }));
    expect(clipboard.copyText).toHaveBeenCalledWith("fth fth-home");
  });

  it("shows the target formats as toggle pills", async () => {
    setup();
    const group = screen.getByRole("group", { name: "Target formats" });
    expect(within(group).getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual(["WOFF2", "WOFF", "TTF", "EOT", "SVG"]);
    await userEvent.click(within(group).getByLabelText("EOT"));
    expect(within(group).getByLabelText("EOT")).toBeChecked();
  });
});

describe("chosen icons and the checklist", () => {
  const list = () => vi.mocked(iconsApi.listIcons).mockResolvedValue({ icons: [makeIcon({ id: "a", name: "Home", slug: "home" }), makeIcon({ id: "b", name: "Star", slug: "star" })], total: 2, page: 1, limit: 1000 });

  it("arrives from the bulk bar on the page itself: no popup, the icons shown as chosen, and built from them", async () => {
    setup({}, { iconIds: ["a", "b"] });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (2)" })).toBeChecked();
    expect(within(screen.getByRole("region", { name: "1. Scope selection" })).getByText("2 / 2")).toBeInTheDocument();
    await waitFor(() => expect(buildFont).toHaveBeenCalledWith("p1", expect.objectContaining({ scope: "selected", iconIds: ["a", "b"] })));
  });

  it("builds with exactly the chosen icons when Build font is pressed", async () => {
    setup({}, { iconIds: ["a", "b"] });
    await builtAutomatically();
    expect(buildFont).toHaveBeenCalledWith("p1", expect.objectContaining({ scope: "selected", iconIds: ["a", "b"] }));
    expect(await within(await screen.findByRole("region", { name: "Built font" })).findByText("2 icons")).toBeInTheDocument();
  });

  it("ignores a damaged hand-over", () => {
    setup({}, { iconIds: "nope" });
    expect(screen.getByRole("radio", { name: /^Whole project/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Selected icons (0)" })).not.toBeChecked();
  });

  it("opens the checklist from Review / edit checklist with the chosen icons ticked, and builds with the new choice at once", async () => {
    list();
    setup({}, { iconIds: ["a", "b"] });
    await userEvent.click(screen.getByRole("button", { name: "Review / edit checklist" }));
    const dialog = screen.getByRole("dialog", { name: "Choose icons for the font" });
    await within(dialog).findByText(/icons selected for the font/);
    expect(within(dialog).getByRole("checkbox", { name: /Home/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Star/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Build font (1 icon)" }));
    await waitFor(() => expect(buildFont).toHaveBeenCalledWith("p1", expect.objectContaining({ scope: "selected", iconIds: ["a"] })));
    expect(screen.getByRole("radio", { name: "Selected icons (1)" })).toBeInTheDocument();
  });

  it("opens the checklist from the page with everything ticked when nothing was chosen", async () => {
    list();
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Review / edit checklist" }));
    const dialog = screen.getByRole("dialog", { name: "Choose icons for the font" });
    await within(dialog).findByText(/icons selected for the font/);
    expect(within(dialog).getByRole("status")).toHaveTextContent("2 of 2 icons selected for the font");
  });

  it("has no Chosen option until something is chosen", () => {
    setup();
    expect(screen.queryByRole("radio", { name: /Selected icons \([1-9]/ })).not.toBeInTheDocument();
  });
});

describe("the built font", () => {
  async function open() {
    setup();
    await builtAutomatically();
    await screen.findByText("2 icons");
  }

  it("copies the stylesheet and a class", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Copy CSS" }));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('url("data:font/woff2;base64,d09GMg==") format("woff2")'));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.not.stringContaining("Feather.woff2"));
    await userEvent.click(screen.getByRole("button", { name: "Copy class fth-star" }));
    expect(clipboard.copyText).toHaveBeenLastCalledWith("fth-star");
    expect(await screen.findByText("Copied the class fth-star.")).toBeInTheDocument();
  });

  it("downloads the ZIP with the same options", async () => {
    const blob = new Blob(["z"]);
    vi.mocked(fontsApi.downloadFont).mockResolvedValue({ blob, filename: "FeatherIcons-font.zip" });
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Download font" }));
    expect(fontsApi.downloadFont).toHaveBeenCalledWith("p1", expect.objectContaining({ fontName: "FeatherIcons", formats: ["woff2", "woff", "ttf"] }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "FeatherIcons-font.zip"));
  });

  it("reports a failed download", async () => {
    vi.mocked(fontsApi.downloadFont).mockRejectedValue(new ApiError("Project not found.", 404));
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Download font" }));
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
  });

  it("filters a long list of characters", async () => {
    buildFont.mockResolvedValue(built({ codepoints: Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `N${i}`, slug: `n${i}`, codepoint: (0xe001 + i).toString(16).toUpperCase(), className: `fth-n${i}`, isNew: false })), iconCount: 12 }));
    setup();
    await builtAutomatically();
    await userEvent.type(await screen.findByLabelText("Filter characters"), "n11");
    expect(screen.getAllByRole("button", { name: /^Copy class/ })).toHaveLength(1);
    await userEvent.clear(screen.getByLabelText("Filter characters"));
    await userEvent.type(screen.getByLabelText("Filter characters"), "zzz");
    expect(screen.getByText("No characters match “zzz”.")).toBeInTheDocument();
  });

  it("takes the old preview font out of the page when a new build replaces it", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Base class"), "x");
    await waitFor(() => expect(preview.unloadPreviewFont).toHaveBeenCalled());
  });
});

describe("building automatically", () => {
  const withIcons = (over = {}) => ({ project: makeDetail({ id: "p1", name: "Feather Icons", prefix: "fth", purpose: "font", iconCount: 2 }), ...over });

  beforeEach(() => {
    fontAutoBuild.enabled = true;
    fontAutoBuild.delayMs = 20;
  });
  afterEach(() => {
    fontAutoBuild.enabled = false;
    fontAutoBuild.delayMs = 700;
  });

  it("builds when the page opens, so Download font is ready without pressing Build font", async () => {
    setup(withIcons());
    await waitFor(() => expect(buildFont).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("2 icons")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download font" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy CSS" })).toBeEnabled();
  });

  it("builds again, once, a moment after a setting changes", async () => {
    setup(withIcons());
    await screen.findByText("2 icons");
    const opening = buildFont.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Base class"), "fth");
    await waitFor(() => expect(buildFont).toHaveBeenLastCalledWith("p1", expect.objectContaining({ baseClass: "fth" })));
    // Once the last change has been built, nothing more happens on its own.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const settled = buildFont.mock.calls.length;
    expect(settled).toBeGreaterThan(opening);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(buildFont).toHaveBeenCalledTimes(settled);
  });

  it("waits while the settings are not valid, and does not complain about it", async () => {
    setup(withIcons());
    await screen.findByText("2 icons");
    await userEvent.clear(screen.getByLabelText("Font name"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(buildFont).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Font name"), "Fixed");
    await waitFor(() => expect(buildFont).toHaveBeenCalledTimes(2));
  });

  it("does not build a project that has no icons", async () => {
    setup(withIcons({ project: makeDetail({ id: "p1", purpose: "font", iconCount: 0 }) }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(buildFont).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download font" })).toBeDisabled();
  });

  it("does not build again a finished font handed over from the Icons screen", async () => {
    cacheBuild({ projectId: "p1", build: built(), family: "iconfont-preview-handover", loaded: true });
    setup(withIcons(), { iconIds: ["a", "b"], built: true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(buildFont).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download font" })).toBeEnabled();
  });

  it("offers Try again when a build failed, and builds on it", async () => {
    buildFont.mockRejectedValueOnce(new ApiError("Could not build.", 500));
    setup(withIcons());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not build.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("2 icons")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download font" })).toBeEnabled();
  });
});
