// Tests for the font build history: the list, an empty and a failing state, downloading a kept package again, and deleting one (editors only, with a confirmation).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fontsApi from "../../api/fonts";
import { ApiError } from "../../api/http";
import type { FontBuildSummary } from "../../api/types";
import { ToastProvider } from "../../context/ToastContext";
import * as zip from "../../utils/zipBundle";
import FontHistory from "./FontHistory";

vi.mock("../../api/fonts");
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));

const builds: FontBuildSummary[] = [
  { id: "b2", version: 2, fontName: "Feather", iconCount: 2, formats: ["woff2", "ttf"], size: 4600, createdAt: "2026-10-20T12:08:38.000Z" },
  { id: "b1", version: 1, fontName: "Old", iconCount: 1, formats: ["ttf"], size: 2048, createdAt: "2026-10-19T09:00:00.000Z" },
];

function setup(over: Partial<React.ComponentProps<typeof FontHistory>> = {}) {
  render(
    <ToastProvider>
      <FontHistory projectId="p1" canEdit version={0} {...over} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fontsApi.listFontBuilds).mockResolvedValue(builds);
});

describe("the list", () => {
  it("shows each kept package with its glyphs, size and formats", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Font build history" })).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("v2")).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText("v1")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/Feather/)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/2 glyphs/)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/4\.5 KB · WOFF2, TTF/)).toBeInTheDocument();
    expect(fontsApi.listFontBuilds).toHaveBeenCalledWith("p1");
  });

  it("says so when nothing was kept yet, differently for editors and viewers", async () => {
    vi.mocked(fontsApi.listFontBuilds).mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/Download a font and it will appear here/)).toBeInTheDocument();
  });

  it("explains an empty history to a viewer", async () => {
    vi.mocked(fontsApi.listFontBuilds).mockResolvedValue([]);
    setup({ canEdit: false });
    expect(await screen.findByText(/No packages have been kept/)).toBeInTheDocument();
  });

  it("shows the reason when the list cannot be loaded, and tries again", async () => {
    vi.mocked(fontsApi.listFontBuilds).mockRejectedValueOnce(new ApiError("Could not load.", 500));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("loads again when a new package was downloaded", async () => {
    const { rerender } = render(
      <ToastProvider>
        <FontHistory projectId="p1" canEdit version={0} />
      </ToastProvider>,
    );
    await screen.findAllByRole("listitem");
    rerender(
      <ToastProvider>
        <FontHistory projectId="p1" canEdit version={1} />
      </ToastProvider>,
    );
    await waitFor(() => expect(fontsApi.listFontBuilds).toHaveBeenCalledTimes(2));
  });
});

describe("downloading again", () => {
  it("fetches the kept ZIP and hands it to the browser", async () => {
    const blob = new Blob(["zip"]);
    vi.mocked(fontsApi.downloadFontBuild).mockResolvedValue({ blob, filename: "Feather-font.zip" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Download Feather v2 from/ }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "Feather-font.zip"));
    expect(fontsApi.downloadFontBuild).toHaveBeenCalledWith("p1", "b2");
  });

  it("shows a message when the download fails", async () => {
    vi.mocked(fontsApi.downloadFontBuild).mockRejectedValue(new ApiError("Build not found", 404));
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Download Feather v2 from/ }));
    expect(await screen.findByText("Build not found")).toBeInTheDocument();
    expect(zip.triggerBrowserDownload).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("asks first, then deletes and reloads", async () => {
    vi.mocked(fontsApi.deleteFontBuild).mockResolvedValue(undefined);
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Delete Old v1 from/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete version 1 of “Old”?" });
    expect(fontsApi.deleteFontBuild).not.toHaveBeenCalled();
    vi.mocked(fontsApi.listFontBuilds).mockResolvedValue([builds[0] as FontBuildSummary]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(fontsApi.deleteFontBuild).toHaveBeenCalledWith("p1", "b1");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  });

  it("has no delete buttons for people who cannot edit", async () => {
    setup({ canEdit: false });
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Download/ })).toHaveLength(2);
  });
});
