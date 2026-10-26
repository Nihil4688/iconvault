// Tests for the Sprite section: building from the project's icons, scopes, preview, copy and downloads, the symbol id list, read-only behaviour and errors.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import * as spritesApi from "../../api/sprites";
import { ToastProvider } from "../../context/ToastContext";
import { WorkspaceContext, type WorkspaceContextValue } from "../../context/workspaceContext";
import * as clipboard from "../../lib/clipboard";
import { buildSprite } from "../../lib/spriteBuild";
import { READ_ONLY, makeDetail, makeFolder, makeIcon } from "../../test/fixtures";
import { renderSpritePreviewPng } from "../../utils/previewPng";
import * as zip from "../../utils/zipBundle";
import SpriteTab from "./SpriteTab";

vi.mock("../../api/icons");
vi.mock("../../api/sprites");
vi.mock("../../lib/clipboard");
vi.mock("../../utils/previewPng", () => ({ renderSpritePreviewPng: vi.fn() }));
vi.mock("../../utils/zipBundle", () => ({ createZip: vi.fn(() => new Blob(["zip"])), triggerBrowserDownload: vi.fn() }));

const listIcons = vi.mocked(iconsApi.listIcons);
const SVG = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">${body}</svg>`;
const icon = (slug: string, name = slug) => ({ ...makeIcon({ id: slug, name, slug }), svg: SVG("<path d='M1 1'/>") });
const reply = (icons: ReturnType<typeof icon>[], total = icons.length) => ({ icons, total, page: 1, limit: 1000 });

function setup(over: Partial<WorkspaceContextValue> = {}, state?: unknown) {
  const fns = { selectFolder: vi.fn(), refreshProject: vi.fn(), refreshFolders: vi.fn(), refreshIcons: vi.fn() };
  const value: WorkspaceContextValue = {
    project: makeDetail({ id: "p1", prefix: "fth", iconCount: 2 }),
    folderList: { folders: [makeFolder({ id: "ui", name: "UI" })], uncategorizedCount: 0 },
    selectedFolder: "all",
    iconsVersion: 0,
    ...fns,
    ...over,
  };
  render(
    <MemoryRouter initialEntries={[{ pathname: "/projects/p1", state }]}>
      <ToastProvider>
        <WorkspaceContext.Provider value={value}>
          <SpriteTab />
        </WorkspaceContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return fns;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(clipboard.copyText).mockResolvedValue(true);
  vi.mocked(zip.createZip).mockReturnValue(new Blob(["zip"]));
  vi.mocked(renderSpritePreviewPng).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(3) } as Blob);
  listIcons.mockResolvedValue(reply([icon("home"), icon("star")]));
  vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue([]);
  vi.mocked(spritesApi.uploadSpriteBuild).mockResolvedValue({ id: "b1", version: 1, mode: "symbol", iconCount: 2, size: 10, createdAt: "2026-10-21T10:00:00.000Z" });
});

describe("building the sprite", () => {
  it("shows a busy state, then the symbol count and size", async () => {
    setup();
    expect(screen.getByLabelText("Building the sprite")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
    expect(await screen.findByText("Sprite generated successfully.", { exact: true })).toBeInTheDocument();
    expect(listIcons).toHaveBeenCalledWith("p1", { sort: "name", limit: 1000, page: 1 });
  });

  it("has no preview panel; the symbol ids are the page's result, and the demo page is in the ZIP", async () => {
    setup();
    await screen.findByText("2 symbols");
    expect(screen.queryByTitle("Sprite preview")).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy code for fth-home" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.createZip).toHaveBeenCalled());
    expect(vi.mocked(zip.createZip).mock.calls[0]![0].some((entry) => entry.name === "demo.html")).toBe(true);
  });

  it("asks for a folder and its subfolders when one is chosen", async () => {
    setup();
    await screen.findByText("2 symbols");
    await userEvent.click(screen.getByRole("radio", { name: "Selected folder" }));
    await userEvent.selectOptions(screen.getByLabelText("Folder"), "ui");
    await waitFor(() => expect(listIcons).toHaveBeenLastCalledWith("p1", { sort: "name", limit: 1000, page: 1, folderId: "ui", includeSubfolders: true }));
  });

  it("fetches every page when the project has more than 1000 icons", async () => {
    const first = Array.from({ length: 2 }, (_, i) => icon(`a${i}`));
    listIcons.mockResolvedValueOnce({ icons: first, total: 3, page: 1, limit: 1000 }).mockResolvedValueOnce({ icons: [icon("b0")], total: 3, page: 2, limit: 1000 });
    setup();
    expect(await screen.findByText("3 symbols")).toBeInTheDocument();
    expect(listIcons).toHaveBeenNthCalledWith(2, "p1", { sort: "name", limit: 1000, page: 2 });
  });

  it("says there is nothing to compile for an empty project", async () => {
    listIcons.mockResolvedValue(reply([]));
    setup();
    expect(await screen.findByText("There is nothing to compile yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download sprite ZIP" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy sprite" })).toBeDisabled();
  });

  it("notes icons whose SVG could not be read", async () => {
    listIcons.mockResolvedValue(reply([icon("home"), { ...icon("bad", "Broken"), svg: "nope" }]));
    setup();
    expect(await screen.findByRole("note")).toHaveTextContent("1 icon could not be included");
    expect(screen.getByText("1 symbol")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    listIcons.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
  });
});

describe("chosen icons", () => {
  const four = () => [icon("home"), icon("star"), icon("dot"), icon("box")];

  it("builds only the icons handed over by the checklist, and says how many were chosen", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup({}, { iconIds: ["home", "box"] });
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (2)" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Copy code for fth-home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code for fth-box" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy code for fth-star" })).not.toBeInTheDocument();
  });

  it("goes back to everything when All icons is chosen again", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup({}, { iconIds: ["home"] });
    await screen.findByText("1 symbol");
    await userEvent.click(screen.getByRole("radio", { name: /^Whole project/ }));
    expect(await screen.findByText("4 symbols")).toBeInTheDocument();
  });

  it("has no Chosen option when nothing was handed over, and ignores a damaged hand-over", async () => {
    setup({}, { iconIds: "nope" });
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (0)" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^Whole project/ })).toBeChecked();
  });

  it("opens the checklist from Choose icons and builds with the new choice", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup();
    await screen.findByText("4 symbols");
    await userEvent.click(screen.getByRole("button", { name: "Review / edit checklist" }));
    const dialog = screen.getByRole("dialog", { name: "Choose icons for the sprite" });
    await within(dialog).findByText(/icons selected for the sprite/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Deselect all" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /home/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Build sprite (1 icon)" }));
    expect(await screen.findByText("1 symbol")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (1)" })).toBeChecked();
  });

  it("arrives from the bulk bar on the page itself, with no popup", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup({}, { iconIds: ["home", "box"] });
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (2)" })).toBeChecked();
  });

  it("opens the checklist from Review / edit checklist with the chosen icons ticked, and builds with the confirmed choice", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup({}, { iconIds: ["home", "box"] });
    await screen.findByText("2 symbols");
    await userEvent.click(screen.getByRole("button", { name: "Review / edit checklist" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose icons for the sprite" });
    await within(dialog).findByText(/icons selected for the sprite/);
    expect(within(dialog).getByRole("checkbox", { name: /home/i })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /star/i })).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /dot/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Build sprite (3 icons)" }));
    expect(await screen.findByText("3 symbols")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Selected icons (3)" })).toBeChecked();
  });

  it("keeps the chosen icons when the checklist is cancelled", async () => {
    listIcons.mockResolvedValue(reply(four()));
    setup({}, { iconIds: ["home", "box"] });
    await screen.findByText("2 symbols");
    await userEvent.click(screen.getByRole("button", { name: "Review / edit checklist" }));
    await userEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Cancel" }));
    expect(screen.getByText("2 symbols")).toBeInTheDocument();
  });

  it("offers the checklist to read-only viewers", async () => {
    setup({ project: makeDetail({ id: "p1", prefix: "fth", access: READ_ONLY }) });
    await screen.findByText("2 symbols");
    expect(screen.getByRole("button", { name: "Review / edit checklist" })).toBeInTheDocument();
  });
});

describe("copy and download", () => {
  it("copies the sprite", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Copy sprite" }));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('<symbol id="fth-home"'));
    expect(await screen.findByText("Copied the sprite.")).toBeInTheDocument();
  });

  it("says when the clipboard is not available", async () => {
    vi.mocked(clipboard.copyText).mockResolvedValue(false);
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Copy sprite" }));
    expect(await screen.findByText("Could not copy to the clipboard.")).toBeInTheDocument();
  });

  it("has no separate sprite.svg download: the ZIP is the main action", async () => {
    setup();
    await screen.findByText("2 symbols");
    expect(screen.queryByRole("button", { name: /sprite\.svg/ })).not.toBeInTheDocument();
    const zipButton = screen.getByRole("button", { name: "Download sprite ZIP" });
    expect(zipButton.className.split(" ")).toContain("bg-primary");
    expect(within(screen.getByRole("group", { name: "Sprite actions" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Download sprite ZIP", "Copy sprite"]);
  });

  it("downloads a bundle with the sprite, demo page, grid sprite and preview image", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(expect.any(Blob), "fth-bundle.zip"));
    const entries = vi.mocked(zip.createZip).mock.calls[0]![0];
    expect(entries.map((entry) => entry.name)).toEqual(["fth.svg", "demo.html", "fth-grid.svg", "preview.png"]);
    expect(await screen.findByText("Sprite ZIP downloaded.")).toBeInTheDocument();
  });

  it("copies the code for one symbol", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Copy code for fth-star" }));
    expect(clipboard.copyText).toHaveBeenCalledWith('<svg width="24" height="24"><use href="#fth-star"></use></svg>');
  });

  it("filters a long id list", async () => {
    listIcons.mockResolvedValue(reply(Array.from({ length: 12 }, (_, i) => icon(`icon${i}`))));
    setup();
    await userEvent.type(await screen.findByLabelText("Filter symbol ids"), "icon11");
    expect(screen.getAllByRole("button", { name: /^Copy code for/ })).toHaveLength(1);
    await userEvent.clear(screen.getByLabelText("Filter symbol ids"));
    await userEvent.type(screen.getByLabelText("Filter symbol ids"), "zzz");
    expect(screen.getByText("No ids match “zzz”.")).toBeInTheDocument();
  });

  it("matches the symbol ids the sprite really contains", async () => {
    setup();
    await screen.findByText("2 symbols");
    const expected = buildSprite([icon("home"), icon("star")], "fth").ids;
    for (const id of expected) expect(screen.getByRole("button", { name: `Copy code for ${id}` })).toBeInTheDocument();
  });
});

describe("read-only viewers", () => {
  it("can build and download", async () => {
    setup({ project: makeDetail({ id: "p1", prefix: "fth", access: READ_ONLY }) });
    expect(await screen.findByText("2 symbols")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download sprite ZIP" })).toBeInTheDocument();
  });
});

describe("the page layout and options", () => {
  const entriesOf = () => vi.mocked(zip.createZip).mock.calls.at(-1)![0];
  const text = (name: string) => String(entriesOf().find((entry) => entry.name === name)?.data);

  it("has three columns like Icon Vault and no heading or Build button of its own", async () => {
    setup();
    await screen.findByText("2 symbols");
    for (const title of ["1. Scope selection", "2. Sprite architecture", "3. Processing options"]) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Build/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate sprite" })).not.toBeInTheDocument();
  });

  it("builds by itself and keeps the download off only until then", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Download sprite ZIP" })).toBeDisabled();
    await screen.findByText("2 symbols");
    expect(screen.getByRole("button", { name: "Download sprite ZIP" })).toBeEnabled();
  });

  it("puts the actions into the project bar when there is one", async () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    setup({ actionsSlot: slot });
    await screen.findByText("2 symbols");
    expect(within(slot).getByRole("button", { name: "Download sprite ZIP" })).toBeInTheDocument();
    slot.remove();
  });

  it("says how many icons are in the scope, on the checklist card", async () => {
    setup({ project: makeDetail({ id: "p1", prefix: "fth", iconCount: 9 }), folderList: { folders: [makeFolder({ id: "ui", name: "UI", iconCount: 4 })], uncategorizedCount: 5 } });
    const scope = screen.getByRole("region", { name: "1. Scope selection" });
    expect(within(scope).getByText("9 / 9")).toBeInTheDocument();
    await userEvent.click(within(scope).getByRole("radio", { name: "Selected folder" }));
    expect(screen.getByText("Choose a folder to build its sprite.")).toBeInTheDocument();
    await userEvent.selectOptions(within(scope).getByLabelText("Folder"), "ui");
    expect(within(scope).getByText("4 / 9")).toBeInTheDocument();
  });

  it("opens the checklist when Selected icons is picked with nothing chosen yet", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Selected icons (0)" }));
    expect(await screen.findByRole("dialog", { name: "Choose icons for the sprite" })).toBeInTheDocument();
  });

  it("makes a stack sprite, with the code for an img tag", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Stack sprite/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy code for fth-star" }));
    expect(clipboard.copyText).toHaveBeenCalledWith('<img src="fth.svg#fth-star" width="24" height="24" alt="">');
    await userEvent.click(screen.getByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.createZip).toHaveBeenCalled());
    expect(text("fth.svg")).toContain(":target");
    expect(text("fth.svg")).not.toContain("<symbol");
    // The demo page still draws symbols.
    expect(text("demo.html")).toContain("fth-star");
  });

  it("adds a stylesheet to the ZIP in the CSS mode", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /CSS companion sprite/ }));
    await screen.findByText("2 symbols");
    await userEvent.click(screen.getByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.createZip).toHaveBeenCalled());
    expect(entriesOf().map((entry) => entry.name)).toEqual(["fth.svg", "demo.html", "fth-grid.svg", "fth.css", "preview.png"]);
    expect(text("fth.css")).toContain(".icon {");
  });

  it("uses the id pattern in the symbol ids, and explains a pattern that cannot be used", async () => {
    setup();
    await screen.findByText("2 symbols");
    const field = screen.getByLabelText("Symbol id pattern");
    await userEvent.clear(field);
    await userEvent.type(field, "ico_{{name}");
    expect(await screen.findByRole("button", { name: "Copy code for ico_star" })).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "{{prefix}");
    expect(await screen.findByText(/must contain {name}/)).toBeInTheDocument();
    expect(screen.getByText(/Until that is fixed, ids use/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code for fth-star" })).toBeInTheDocument();
  });

  it("turns colours into currentColor when asked", async () => {
    listIcons.mockResolvedValue(reply([{ ...icon("home"), svg: SVG("<path fill='#ff0000' d='M1 1'/>") }]));
    setup();
    await screen.findByText("1 symbol");
    await userEvent.click(screen.getByLabelText(/Convert colours to currentColor/));
    await userEvent.click(screen.getByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.createZip).toHaveBeenCalled());
    expect(text("fth.svg")).toContain('fill="currentColor"');
    expect(text("fth.svg")).not.toContain("#ff0000");
  });
});

describe("the sprite build history", () => {
  it("keeps an editor's download in the history and shows it again", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(spritesApi.uploadSpriteBuild).toHaveBeenCalledWith("p1", expect.any(Blob), { mode: "symbol", iconCount: 2 }));
    await waitFor(() => expect(spritesApi.listSpriteBuilds).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "Sprite build history" })).toBeInTheDocument();
  });

  it("does not keep a viewer's download", async () => {
    setup({ project: makeDetail({ id: "p1", prefix: "fth", iconCount: 2, access: READ_ONLY }) });
    await userEvent.click(await screen.findByRole("button", { name: "Download sprite ZIP" }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalled());
    expect(spritesApi.uploadSpriteBuild).not.toHaveBeenCalled();
  });

  it("still downloads when keeping it in the history fails", async () => {
    vi.mocked(spritesApi.uploadSpriteBuild).mockRejectedValue(new ApiError("Too large.", 400));
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Download sprite ZIP" }));
    expect(await screen.findByText("Sprite ZIP downloaded.")).toBeInTheDocument();
    expect(screen.queryByText("Too large.")).not.toBeInTheDocument();
  });
});
