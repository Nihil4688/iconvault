// Tests for the icon drawer: details and editing, read-only view, preview controls, copy and download, optimize, trash with undo, code editing with a safe live preview, and versions.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import type { IconDetail } from "../../api/types";
import { ToastProvider } from "../../context/ToastContext";
import * as clipboard from "../../lib/clipboard";
import { makeFolder, makeIcon } from "../../test/fixtures";
import * as zip from "../../utils/zipBundle";
import IconDrawer from "./IconDrawer";

vi.mock("../../api/icons");
vi.mock("../../lib/clipboard");
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
const folders = [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "ar", name: "Arrows", parentId: "ui" })];

const detail = (over: Partial<IconDetail> = {}): IconDetail => ({
  ...makeIcon({ id: "ic1", name: "Arrow Left", slug: "arrow-left", tags: ["nav"], byteSize: 150, originalByteSize: 300, folderId: "ui", codepoint: "E001", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-18T10:00:00.000Z" }),
  svg: SVG,
  versions: [],
  ...over,
});

function setup(over: Partial<React.ComponentProps<typeof IconDrawer>> = {}) {
  const props = { iconId: "ic1", canEdit: true, folders, idPrefix: "feather", onClose: vi.fn(), onChanged: vi.fn(), ...over };
  render(
    <ToastProvider>
      <IconDrawer {...props} />
    </ToastProvider>,
  );
  return { ...props, onClose: props.onClose as ReturnType<typeof vi.fn>, onChanged: props.onChanged as ReturnType<typeof vi.fn> };
}
const ready = async () => screen.findByRole("heading", { level: 3, name: "Arrow Left" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(iconsApi.getIcon).mockResolvedValue(detail());
  vi.mocked(clipboard.copyText).mockResolvedValue(true);
});

describe("loading", () => {
  it("is closed without an icon", () => {
    setup({ iconId: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(iconsApi.getIcon).not.toHaveBeenCalled();
  });

  it("shows a loading message, then the icon with the id it will have in a sprite", async () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Icon details" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading icon");
    await ready();
    expect(screen.getByText("feather-arrow-left")).toBeInTheDocument();
    expect(iconsApi.getIcon).toHaveBeenCalledWith("ic1");
  });

  it("explains a failure and can try again", async () => {
    vi.mocked(iconsApi.getIcon).mockRejectedValueOnce(new ApiError("Icon not found.", 404));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Icon not found.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
  });

  it("closes from the Close button", async () => {
    const { onClose } = setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("details", () => {
  it("shows size and savings, canvas, dates", async () => {
    setup();
    await ready();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/150 B/)).toBeInTheDocument();
    expect(within(panel).getByText(/was 300 B, 50% smaller/)).toBeInTheDocument();
    expect(within(panel).getByText("0 0 24 24")).toBeInTheDocument();
    expect(within(panel).getByText("Oct 1, 2026")).toBeInTheDocument();
  });

  it("warns about what will not become a font glyph", async () => {
    vi.mocked(iconsApi.getIcon).mockResolvedValue(detail({ hasStroke: true, hasGradient: true }));
    setup();
    await ready();
    expect(screen.getByRole("note")).toHaveTextContent("Stroke, Gradient");
  });

  it("starts with the saved values and cannot save until something changes", async () => {
    setup();
    await ready();
    expect(screen.getByLabelText("Name")).toHaveValue("Arrow Left");
    expect(screen.getByLabelText("Folder")).toHaveValue("ui");
    expect(screen.getByLabelText("Tags")).toHaveValue("nav");
    expect(screen.getByLabelText("Font codepoint")).toHaveValue("E001");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves only what changed and refreshes", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue({ ...makeIcon(), svg: SVG });
    const { onChanged } = setup();
    await ready();
    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "  Arrow Back ");
    await userEvent.clear(screen.getByLabelText("Tags"));
    await userEvent.type(screen.getByLabelText("Tags"), "Nav, Left, nav");
    await userEvent.selectOptions(screen.getByLabelText("Folder"), "");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(iconsApi.updateIcon).toHaveBeenCalledWith("ic1", { name: "Arrow Back", folderId: null, tags: ["nav", "left"] });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(iconsApi.getIcon).toHaveBeenCalledTimes(2));
  });

  it("sets and clears the codepoint, upper-casing it", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue({ ...makeIcon(), svg: SVG });
    setup();
    await ready();
    const field = screen.getByLabelText("Font codepoint");
    await userEvent.clear(field);
    await userEvent.type(field, "e0aa");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(iconsApi.updateIcon).toHaveBeenLastCalledWith("ic1", { codepoint: "E0AA" });
  });

  it("blocks a codepoint that is not private-use or not hex, with the reason", async () => {
    setup();
    await ready();
    const field = screen.getByLabelText("Font codepoint");
    await userEvent.clear(field);
    await userEvent.type(field, "0041");
    expect(screen.getByText(/E000 to F8FF so it cannot replace/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "xyz");
    expect(screen.getByText(/exactly 4 hex digits/)).toBeInTheDocument();
    await userEvent.clear(field);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("refuses an empty name, and shows a server refusal", async () => {
    vi.mocked(iconsApi.updateIcon).mockRejectedValue(new ApiError('Another icon already uses the id "bell".', 409));
    setup();
    await ready();
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    await userEvent.type(screen.getByLabelText("Name"), "Bell");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Another icon already uses the id "bell".');
  });

  it("is read-only for people who cannot edit", async () => {
    setup({ canEdit: false });
    await ready();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByText("UI")).toBeInTheDocument();
    expect(screen.getByText("nav")).toBeInTheDocument();
    expect(screen.getByText("E001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Optimize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to trash" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy SVG" })).toBeInTheDocument();
  });
});

describe("preview", () => {
  it("shows the icon at the project-wide size, with no size buttons or background switch of its own", async () => {
    setup();
    await ready();
    expect(screen.getByRole("img", { name: "Arrow Left at 40 pixels" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Preview size" })).not.toBeInTheDocument();

    expect(screen.queryByLabelText("Preview background")).not.toBeInTheDocument();
  });

  it("uses the background chosen in the Icons toolbar", async () => {
    window.localStorage.setItem("iconSurface", "dark");
    setup();
    await ready();
    expect(screen.getByRole("img", { name: /at 40 pixels/ }).parentElement?.className).toContain("bg-neutral-900");
    window.localStorage.removeItem("iconSurface");
  });

  it("follows the size chosen in the Icons toolbar", async () => {
    window.localStorage.setItem("iconAppearance", JSON.stringify({ size: 72, color: "", style: "natural" }));
    setup();
    await ready();
    expect(screen.getByRole("img", { name: "Arrow Left at 72 pixels" })).toBeInTheDocument();
    window.localStorage.removeItem("iconAppearance");
  });
});

describe("copy and download", () => {
  it("copies the SVG, and the React and Vue components", async () => {
    setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Copy SVG" }));
    expect(clipboard.copyText).toHaveBeenLastCalledWith(SVG);
    expect(await screen.findByText("Copied the SVG.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy React" }));
    expect(vi.mocked(clipboard.copyText).mock.calls.at(-1)?.[0]).toContain("export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>)");
    await userEvent.click(screen.getByRole("button", { name: "Copy Vue" }));
    expect(vi.mocked(clipboard.copyText).mock.calls.at(-1)?.[0]).toMatch(/^<template>/);
  });

  it("says when copying is not possible", async () => {
    vi.mocked(clipboard.copyText).mockResolvedValue(false);
    setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Copy SVG" }));
    expect(await screen.findByText("Could not copy to the clipboard.")).toBeInTheDocument();
  });

  it("downloads the file", async () => {
    const blob = new Blob(["x"]);
    vi.mocked(iconsApi.downloadIcon).mockResolvedValue({ blob, filename: "arrow-left.svg" });
    setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "arrow-left.svg"));
  });
});

describe("optimize and trash", () => {
  it("optimizes, says by how much, and refreshes", async () => {
    vi.mocked(iconsApi.optimizeIcon).mockResolvedValue({ icon: makeIcon(), changed: true, before: 300, after: 120, savingsPercent: 60 });
    const { onChanged } = setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText(/Optimized: 300 B to 120 B \(60% smaller\)/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(iconsApi.getIcon).toHaveBeenCalledTimes(2));
  });

  it("says so when there is nothing to gain", async () => {
    vi.mocked(iconsApi.optimizeIcon).mockResolvedValue({ icon: makeIcon(), changed: false, before: 100, after: 100, savingsPercent: 0 });
    const { onChanged } = setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("Already as small as it can be.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("moves to the trash, closes, and offers Undo", async () => {
    vi.mocked(iconsApi.deleteIcon).mockResolvedValue({});
    vi.mocked(iconsApi.restoreIcon).mockResolvedValue({ icon: makeIcon(), adjusted: [] });
    const { onChanged, onClose } = setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    expect(iconsApi.deleteIcon).toHaveBeenCalledWith("ic1");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText("Moved “Arrow Left” to the trash.")).toBeInTheDocument();
    const changedBefore = onChanged.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(iconsApi.restoreIcon).toHaveBeenCalledWith("ic1");
    await waitFor(() => expect(onChanged.mock.calls.length).toBeGreaterThan(changedBefore));
  });

  it("shows a failure as a message and stays open", async () => {
    vi.mocked(iconsApi.optimizeIcon).mockRejectedValue(new ApiError("This icon is in the trash. Restore it first.", 409));
    const { onClose } = setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("This icon is in the trash. Restore it first.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("code", () => {
  const openCode = async () => userEvent.click(screen.getByRole("tab", { name: /Code/ }));

  it("shows the code with generated snippets, and a safe preview of the draft", async () => {
    setup();
    await ready();
    await openCode();
    expect(screen.getByLabelText("SVG code")).toHaveValue(SVG);
    expect(screen.getByRole("region", { name: "React component (TSX)" })).toHaveTextContent("export function ArrowLeftIcon");
    expect(screen.getByRole("region", { name: "Vue 3 component" })).toHaveTextContent("<template>");
    const preview = screen.getByAltText("Preview of the code") as HTMLImageElement;
    expect(preview.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(preview.src.split(",")[1] as string)).toBe(SVG);
  });

  it("never injects the draft into the page as markup", async () => {
    setup();
    await ready();
    await openCode();
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.example/x"/></svg>' } });
    expect(document.querySelector("dialog script")).toBeNull();
    expect(document.querySelector("dialog image")).toBeNull();
    expect((screen.getByAltText("Preview of the code") as HTMLImageElement).src).toMatch(/^data:image\/svg\+xml/);
  });

  it("saves edited code, and can revert", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue({ ...makeIcon(), svg: SVG });
    const { onChanged } = setup();
    await ready();
    await openCode();
    expect(screen.getByRole("button", { name: "Save SVG" })).toBeDisabled();
    const edited = SVG.replace("M2 2", "M3 3");
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: edited } });
    await userEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByLabelText("SVG code")).toHaveValue(SVG);

    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: edited } });
    await userEvent.click(screen.getByRole("button", { name: "Save SVG" }));
    expect(iconsApi.updateIcon).toHaveBeenCalledWith("ic1", { rawSvg: edited });
    expect(await screen.findByText("Saved. The previous version is kept.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows the server's reason when the code is refused", async () => {
    vi.mocked(iconsApi.updateIcon).mockRejectedValue(new ApiError("Invalid SVG: the markup could not be parsed.", 400));
    setup();
    await ready();
    await openCode();
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: "<svg><path" } });
    await userEvent.click(screen.getByRole("button", { name: "Save SVG" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid SVG: the markup could not be parsed.");
  });

  it("is read-only for people who cannot edit", async () => {
    setup({ canEdit: false });
    await ready();
    await openCode();
    expect(screen.getByLabelText("SVG code")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save SVG" })).not.toBeInTheDocument();
    expect(screen.queryByAltText("Preview of the code")).not.toBeInTheDocument();
  });

  it("copies a snippet", async () => {
    setup();
    await ready();
    await openCode();
    const section = screen.getByRole("region", { name: "Vue 3 component" });
    await userEvent.click(within(section).getByRole("button", { name: "Copy" }));
    expect(vi.mocked(clipboard.copyText).mock.calls.at(-1)?.[0]).toMatch(/^<template>/);
  });
});

describe("versions", () => {
  const versions = [
    { id: "v2", byteSize: 140, createdAt: "2026-10-18T09:00:00.000Z" },
    { id: "v1", byteSize: 200, createdAt: "2026-10-10T09:00:00.000Z" },
  ];
  const openVersions = async () => userEvent.click(screen.getByRole("tab", { name: /Versions/ }));

  it("explains when there are none", async () => {
    setup();
    await ready();
    expect(screen.getByRole("tab", { name: "Versions (0)" })).toBeInTheDocument();
    await openVersions();
    expect(screen.getByText(/No earlier versions yet/)).toBeInTheDocument();
  });

  it("lists versions and restores one", async () => {
    vi.mocked(iconsApi.getIcon).mockResolvedValue(detail({ versions }));
    vi.mocked(iconsApi.restoreVersion).mockResolvedValue(detail({ versions }));
    const { onChanged } = setup();
    await ready();
    await openVersions();
    const list = screen.getByRole("list", { name: "Earlier versions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Most recent change")).toBeInTheDocument();
    expect(within(list).getByText(/200 B/)).toBeInTheDocument();
    await userEvent.click(within(list).getAllByRole("button", { name: /Restore the version/ })[1] as HTMLElement);
    expect(iconsApi.restoreVersion).toHaveBeenCalledWith("ic1", "v1");
    expect(await screen.findByText("Restored. The version you replaced is kept too.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("has no restore buttons for read-only viewers", async () => {
    vi.mocked(iconsApi.getIcon).mockResolvedValue(detail({ versions }));
    setup({ canEdit: false });
    await ready();
    await openVersions();
    expect(screen.queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
  });

  it("reports a failed restore", async () => {
    vi.mocked(iconsApi.getIcon).mockResolvedValue(detail({ versions }));
    vi.mocked(iconsApi.restoreVersion).mockRejectedValue(new ApiError("Version not found.", 404));
    setup();
    await ready();
    await openVersions();
    await userEvent.click(screen.getAllByRole("button", { name: /Restore the version/ })[0] as HTMLElement);
    expect(await screen.findByText("Version not found.")).toBeInTheDocument();
  });
});
