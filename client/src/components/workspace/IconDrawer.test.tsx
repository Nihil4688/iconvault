// Tests for the icon drawer: details and editing, read-only view, preview controls, copy and download, optimize, trash with undo, code editing with a safe live preview, and versions.
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows a shimmer placeholder, then the icon with the id it will have in a sprite", async () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Icon Details" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading Icon");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Loading icon/)).not.toBeInTheDocument();
    await ready();
    expect(screen.getByText("feather-arrow-left")).toBeInTheDocument();
    expect(iconsApi.getIcon).toHaveBeenCalledWith("ic1");
  });

  it("keeps every placeholder block the size of the panel it stands in for", async () => {
    setup();
    const status = screen.getByRole("status");
    // The preview keeps the height of the real preview box, so the drawer does not jump when the icon arrives.
    const preview = status.querySelector(".min-h-44") as HTMLElement;
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveClass("min-h-44");
    // The fields keep the height of a real field.
    const field = status.querySelector(".h-9.rounded-lg") as HTMLElement;
    expect(field).toBeInTheDocument();
    expect(field).toHaveClass("h-9");
    // The facts row keeps the four columns of the real one.
    expect(status.querySelectorAll(".grid-cols-4 > div")).toHaveLength(4);
    await ready();
  });

  it("explains a failure and can try again", async () => {
    vi.mocked(iconsApi.getIcon).mockRejectedValueOnce(new ApiError("Icon not found.", 404));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Icon not found.");
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
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
  it("uses the icon's folder-specific size and colour in its preview", async () => {
    const key = "project:p1:folder:ui:iconAppearance";
    window.localStorage.removeItem(key);
    window.localStorage.setItem(key, JSON.stringify({ size: 64, color: "#123456" }));
    setup({ projectId: "p1" });

    const preview = await screen.findByRole("img", { name: "Arrow Left at 64 Pixels" });

    expect(preview).toHaveStyle({ width: "64px", height: "64px", color: "#123456" });
    window.localStorage.removeItem(key);
  });

  it("shows the canvas, size and dates in the facts row", async () => {
    setup();
    await ready();
    const row = screen.getByText("Canvas").closest("dl") as HTMLElement;
    expect(within(row).getByText("24 × 24")).toBeInTheDocument();
    expect(within(row).getByText(/150 B/)).toBeInTheDocument();
    expect(within(row).getByText("Canvas")).toBeInTheDocument();
    expect(within(row).getByText("Size")).toBeInTheDocument();
    expect(within(row).getByText("Added on")).toBeInTheDocument();
    expect(within(row).getByText("Last updated")).toBeInTheDocument();
    expect(within(row).getByText("Oct 1, 2026")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Folder")).toHaveAttribute("aria-label", "Folder: UI");
    expect(screen.getByLabelText("Tags")).toHaveValue("nav");
    expect(screen.getByLabelText("Font Codepoint")).toHaveValue("E001");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
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
    await userEvent.click(screen.getByRole("button", { name: "Folder: UI" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Folder" })).getByRole("menuitemradio", { name: "Uncategorized (Project Root)" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(iconsApi.updateIcon).toHaveBeenCalledWith("ic1", { name: "Arrow Back", folderId: null, tags: ["nav", "left"] });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(iconsApi.getIcon).toHaveBeenCalledTimes(2));
  });

  it("sets and clears the codepoint, upper-casing it", async () => {
    vi.mocked(iconsApi.updateIcon).mockResolvedValue({ ...makeIcon(), svg: SVG });
    setup();
    await ready();
    const field = screen.getByLabelText("Font Codepoint");
    await userEvent.clear(field);
    await userEvent.type(field, "e0aa");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(iconsApi.updateIcon).toHaveBeenLastCalledWith("ic1", { codepoint: "E0AA" });
  });

  it("blocks a codepoint that is not private-use or not hex, with the reason", async () => {
    setup();
    await ready();
    const field = screen.getByLabelText("Font Codepoint");
    await userEvent.clear(field);
    await userEvent.type(field, "0041");
    expect(screen.getByText(/E000 to F8FF so it cannot replace/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "xyz");
    expect(screen.getByText(/exactly 4 hex digits/)).toBeInTheDocument();
    await userEvent.clear(field);
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("refuses an empty name, and shows a server refusal", async () => {
    vi.mocked(iconsApi.updateIcon).mockRejectedValue(new ApiError('Another icon already uses the id "bell".', 409));
    setup();
    await ready();
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    await userEvent.type(screen.getByLabelText("Name"), "Bell");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Another icon already uses the id "bell".');
  });

  it("shows the fields disabled for people who cannot edit", async () => {
    setup({ canEdit: false });
    await ready();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Tags")).toBeDisabled();
    expect(screen.getByLabelText("Font Codepoint")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Folder: UI" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Optimize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to Trash" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});

describe("preview", () => {
  it("shows the icon at its folder-specific size, with no size buttons or background switch of its own", async () => {
    setup();
    await ready();
    expect(screen.getByRole("img", { name: "Arrow Left at 40 Pixels" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Preview size" })).not.toBeInTheDocument();

    expect(screen.queryByLabelText("Preview background")).not.toBeInTheDocument();
  });

  it("uses the background chosen in the Icons toolbar", async () => {
    // The surface is remembered per project, under "project:<id>:iconSurface".
    const key = "project:p1:iconSurface";
    window.localStorage.removeItem(key);
    window.localStorage.setItem(key, "dark");
    setup({ projectId: "p1" });
    await ready();
    expect(screen.getByRole("img", { name: /at 40 Pixels/ }).parentElement?.className).toContain("bg-neutral-900");
    window.localStorage.removeItem(key);
  });

  it("follows the size chosen in the Icons toolbar", async () => {
    const key = "project:p1:folder:ui:iconAppearance";
    window.localStorage.removeItem(key);
    // 72 is not one of the preset sizes, so it snaps to the closest one (64).
    window.localStorage.setItem(key, JSON.stringify({ size: 72, color: "", style: "natural" }));
    setup({ projectId: "p1" });
    await ready();
    expect(screen.getByRole("img", { name: "Arrow Left at 64 Pixels" })).toBeInTheDocument();
    window.localStorage.removeItem(key);
  });
});

describe("copy and download", () => {
  it("copies the SVG, and the React and Vue components", async () => {
    setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(clipboard.copyText).toHaveBeenLastCalledWith(SVG);
    expect(await screen.findByText("Copied the SVG.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More copy options" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Copy as" })).getByRole("menuitem", { name: "Copy React" }));
    expect(vi.mocked(clipboard.copyText).mock.calls.at(-1)?.[0]).toContain("export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>)");
    await userEvent.click(screen.getByRole("button", { name: "More copy options" }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Copy as" })).getByRole("menuitem", { name: "Copy Vue" }));
    expect(vi.mocked(clipboard.copyText).mock.calls.at(-1)?.[0]).toMatch(/^<template>/);
  });

  it("says when copying is not possible", async () => {
    vi.mocked(clipboard.copyText).mockResolvedValue(false);
    setup();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
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
