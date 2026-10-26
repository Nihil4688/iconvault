// Tests for the Import SVG Sprite and Import Icon Font dialogs (opened from the Icons page's Upload icons menu): reading the file first, options, results and errors.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fontsApi from "../../api/fonts";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import type { FontImportPreview, FontImportResult } from "../../api/types";
import { buildSprite } from "../../lib/spriteBuild";
import { makeFolder, makeIcon } from "../../test/fixtures";
import ImportFontDialog from "./ImportFontDialog";
import ImportSpriteDialog from "./ImportSpriteDialog";

vi.mock("../../api/fonts");
vi.mock("../../api/icons");

const importFont = vi.mocked(fontsApi.importFont);
const SVG = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">${body}</svg>`;
const icon = (slug: string, name = slug) => ({ ...makeIcon({ id: slug, name, slug }), svg: SVG("<path d='M1 1'/>") });
const folders = [makeFolder({ id: "ui", name: "UI" })];

function setupSprite() {
  const fns = { onImported: vi.fn(), onClose: vi.fn() };
  render(<ImportSpriteDialog open projectId="p1" prefix="fth" folders={folders} defaultFolderId={null} {...fns} />);
  return fns;
}

function setupFont() {
  const fns = { onImported: vi.fn(), onClose: vi.fn() };
  render(<ImportFontDialog open projectId="p1" folders={folders} defaultFolderId={null} {...fns} />);
  return fns;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("importing a sprite", () => {
  const spriteText = buildSprite([icon("home"), icon("star")], "fth").xml;
  const summary = (over: Partial<Awaited<ReturnType<typeof iconsApi.uploadIcons>>> = {}) => ({ created: [makeIcon({ id: "n1" }), makeIcon({ id: "n2" })], replaced: [], skipped: [], errors: [], foldersCreated: 0, ...over });

  async function open(file: File | null = new File([spriteText], "my-sprite.svg", { type: "image/svg+xml" })) {
    const fns = setupSprite();
    const dialog = screen.getByRole("dialog", { name: "Import a sprite" });
    if (file) fireEvent.change(within(dialog).getByLabelText("Sprite file"), { target: { files: [file] } });
    return { fns, dialog };
  }

  it("reads the symbols and imports each as an icon, then refreshes", async () => {
    vi.mocked(iconsApi.uploadIcons).mockResolvedValue(summary());
    const { fns, dialog } = await open();
    expect(await within(dialog).findByText(/holds 2 symbols/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 icons" }));
    expect(await within(dialog).findByText("Imported 2 icons.")).toBeInTheDocument();
    const [projectId, files, options] = vi.mocked(iconsApi.uploadIcons).mock.calls[0]!;
    expect(projectId).toBe("p1");
    expect(files.map((file) => file.name)).toEqual(["home.svg", "star.svg"]);
    expect(options).toEqual({ folderId: null, strategy: "rename", optimize: true });
    expect(fns.onImported).toHaveBeenCalled();
  });

  it("sends the chosen folder and clash handling", async () => {
    vi.mocked(iconsApi.uploadIcons).mockResolvedValue(summary());
    const { dialog } = await open();
    await within(dialog).findByText(/holds 2 symbols/);
    await userEvent.selectOptions(within(dialog).getByLabelText("Folder"), "ui");
    await userEvent.selectOptions(within(dialog).getByLabelText("If an icon with that name exists"), "replace");
    await userEvent.click(within(dialog).getByLabelText("Optimize to make the icons smaller"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 icons" }));
    await within(dialog).findByText("Imported 2 icons.");
    expect(vi.mocked(iconsApi.uploadIcons).mock.calls[0]![2]).toEqual({ folderId: "ui", strategy: "replace", optimize: false });
  });

  it("explains a file that is not a sprite", async () => {
    const { dialog } = await open(new File([SVG("<path/>")], "single.svg", { type: "image/svg+xml" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("no symbols");
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("rejects a file that is not an svg", async () => {
    const { dialog } = await open(new File(["x"], "notes.txt"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("ending in .svg");
  });

  it("lists symbols that could not be imported and ones that were skipped", async () => {
    vi.mocked(iconsApi.uploadIcons).mockResolvedValue(summary({ created: [makeIcon({ id: "n1" })], skipped: [{ name: "star", reason: "Already exists." }], errors: [{ file: "home.svg", message: "Unsafe content." }] }));
    const { dialog } = await open();
    await within(dialog).findByText(/holds 2 symbols/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 icons" }));
    expect(await within(dialog).findByText("Imported 1 icon.")).toBeInTheDocument();
    expect(within(dialog).getByText("Unsafe content.")).toBeInTheDocument();
    expect(within(dialog).getByText(/star: Already exists\./)).toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when the import fails", async () => {
    vi.mocked(iconsApi.uploadIcons).mockRejectedValue(new ApiError("Upload failed.", 500));
    const { dialog, fns } = await open();
    await within(dialog).findByText(/holds 2 symbols/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 icons" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload failed.");
    expect(fns.onImported).not.toHaveBeenCalled();
  });

  it("round trips: a sprite built from this project imports back without doubling the prefix", async () => {
    vi.mocked(iconsApi.uploadIcons).mockResolvedValue(summary());
    const { dialog } = await open();
    await within(dialog).findByText(/holds 2 symbols/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 2 icons" }));
    await within(dialog).findByText("Imported 2 icons.");
    expect(vi.mocked(iconsApi.uploadIcons).mock.calls[0]![1].every((file) => !file.name.startsWith("fth-"))).toBe(true);
  });
});

describe("importing a font", () => {
  const dry = (over: Partial<FontImportPreview> = {}): FontImportPreview => ({ dryRun: true, kind: "truetype", total: 40, importable: 12, truncated: false, limit: 2000, sample: [{ name: "home", codepoint: "E001" }, { name: "star", codepoint: "E002" }], ...over });
  const final = (over: Partial<FontImportResult> = {}): FontImportResult => ({ ...dry({ dryRun: false }), created: [makeIcon({ id: "n1" }), makeIcon({ id: "n2" })], replaced: [], skipped: [], errors: [], codepointsKept: 2, codepointsDropped: 0, ...over });

  async function open(file: File | null = new File(["font"], "icons.ttf", { type: "font/ttf" })) {
    const fns = setupFont();
    const dialog = screen.getByRole("dialog", { name: "Import a font" });
    if (file) fireEvent.change(within(dialog).getByLabelText("Font file"), { target: { files: [file] } });
    return { fns, dialog };
  }

  it("asks the server what the font holds before importing anything", async () => {
    importFont.mockResolvedValue(dry());
    const { dialog } = await open();
    expect(await within(dialog).findByText(/has 40 glyphs/)).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(/12 icons will be imported, for example home, star/);
    expect(importFont).toHaveBeenCalledWith("p1", expect.any(File), null, { dryRun: true, privateUseOnly: true });
    expect(within(dialog).getByRole("button", { name: "Import 12 icons" })).toBeEnabled();
  });

  it("asks again when the names file or the Private Use choice changes", async () => {
    importFont.mockResolvedValue(dry());
    const { dialog } = await open();
    await within(dialog).findByText(/has 40 glyphs/);
    const map = new File([".icon-a:before{}"], "map.css", { type: "text/css" });
    fireEvent.change(within(dialog).getByLabelText("Names (optional)"), { target: { files: [map] } });
    await waitFor(() => expect(importFont).toHaveBeenLastCalledWith("p1", expect.any(File), map, { dryRun: true, privateUseOnly: true }));
    await userEvent.click(within(dialog).getByLabelText(/Only icon characters/));
    await waitFor(() => expect(importFont).toHaveBeenLastCalledWith("p1", expect.any(File), map, { dryRun: true, privateUseOnly: false }));
  });

  it("imports with the chosen folder and options, then shows the result and refreshes", async () => {
    importFont.mockResolvedValueOnce(dry()).mockResolvedValueOnce(final());
    const { fns, dialog } = await open();
    await within(dialog).findByText(/has 40 glyphs/);
    await userEvent.selectOptions(within(dialog).getByLabelText("Folder"), "ui");
    await userEvent.selectOptions(within(dialog).getByLabelText("If an icon with that name exists"), "skip");
    await userEvent.click(within(dialog).getByLabelText("Optimize to make the icons smaller"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 12 icons" }));
    expect(await within(dialog).findByText("Imported 2 icons.")).toBeInTheDocument();
    expect(importFont).toHaveBeenLastCalledWith("p1", expect.any(File), null, { folderId: "ui", strategy: "skip", optimize: false, privateUseOnly: true });
    expect(within(dialog).getByText(/2 characters kept/)).toBeInTheDocument();
    expect(fns.onImported).toHaveBeenCalled();
  });

  it("lists glyphs that could not be imported and characters that were not kept", async () => {
    importFont.mockResolvedValueOnce(dry()).mockResolvedValueOnce(final({ codepointsDropped: 1, errors: [{ file: "bad", message: "Contains a script." }], skipped: [{ name: "star", reason: "Exists" }] }));
    const { dialog } = await open();
    await within(dialog).findByText(/has 40 glyphs/);
    await userEvent.click(within(dialog).getByRole("button", { name: /Import 12 icons/ }));
    expect(await within(dialog).findByText(/1 character already used here and not kept/)).toBeInTheDocument();
    expect(within(dialog).getByText("Contains a script.")).toBeInTheDocument();
    expect(within(dialog).getByText("1 icon skipped.")).toBeInTheDocument();
  });

  it("shows the reason for a file that is not a font, and cannot import it", async () => {
    importFont.mockRejectedValue(new ApiError("That is not a font file this tool can read.", 400));
    const { dialog } = await open(new File(["zip"], "pack.zip"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("not a font file");
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("keeps the dialog open with the reason when the import itself fails", async () => {
    importFont.mockResolvedValueOnce(dry()).mockRejectedValueOnce(new ApiError("You can only change projects you own.", 403));
    const { dialog, fns } = await open();
    await within(dialog).findByText(/has 40 glyphs/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Import 12 icons" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("only change projects you own");
    expect(fns.onImported).not.toHaveBeenCalled();
  });

  it("mentions when a font was cut off at the limit", async () => {
    importFont.mockResolvedValue(dry({ truncated: true, limit: 2000 }));
    const { dialog } = await open();
    expect(await within(dialog).findByText(/Only the first 2000 are read/)).toBeInTheDocument();
  });
});
