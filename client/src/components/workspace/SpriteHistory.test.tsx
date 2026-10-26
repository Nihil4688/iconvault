// Tests for the sprite build history: the list, empty and failing states, downloading a kept ZIP again, and deleting one (editors only, with a confirmation).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as spritesApi from "../../api/sprites";
import type { SpriteBuildSummary } from "../../api/types";
import { ToastProvider } from "../../context/ToastContext";
import * as zip from "../../utils/zipBundle";
import SpriteHistory from "./SpriteHistory";

vi.mock("../../api/sprites");
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));

const builds: SpriteBuildSummary[] = [
  { id: "b2", version: 2, mode: "stack", iconCount: 7, size: 4600, createdAt: "2026-10-20T12:08:38.000Z" },
  { id: "b1", version: 1, mode: "symbol", iconCount: 3, size: 2048, createdAt: "2026-10-19T09:00:00.000Z" },
];

function setup(over: Partial<React.ComponentProps<typeof SpriteHistory>> = {}) {
  render(
    <ToastProvider>
      <SpriteHistory projectId="p1" canEdit version={0} {...over} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue(builds);
});

describe("the list", () => {
  it("shows each kept ZIP with its version, architecture, symbols and size", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Sprite build history" })).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("v2")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/Stack sprite/)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/7 symbols/)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/4\.5 KB/)).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText(/Symbol sprite/)).toBeInTheDocument();
    expect(spritesApi.listSpriteBuilds).toHaveBeenCalledWith("p1");
  });

  it("says so when nothing was kept, differently for editors and viewers", async () => {
    vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/Download a sprite ZIP and it will appear here/)).toBeInTheDocument();
  });

  it("explains an empty history to a viewer", async () => {
    vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue([]);
    setup({ canEdit: false });
    expect(await screen.findByText(/No sprite ZIPs have been kept/)).toBeInTheDocument();
  });

  it("shows the reason when the list cannot be loaded, and tries again", async () => {
    vi.mocked(spritesApi.listSpriteBuilds).mockRejectedValueOnce(new ApiError("Could not load.", 500));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("loads again when a new ZIP was downloaded", async () => {
    const { rerender } = render(
      <ToastProvider>
        <SpriteHistory projectId="p1" canEdit version={0} />
      </ToastProvider>,
    );
    await screen.findAllByRole("listitem");
    rerender(
      <ToastProvider>
        <SpriteHistory projectId="p1" canEdit version={1} />
      </ToastProvider>,
    );
    await waitFor(() => expect(spritesApi.listSpriteBuilds).toHaveBeenCalledTimes(2));
  });
});

describe("downloading again", () => {
  it("fetches the kept ZIP and hands it to the browser", async () => {
    const blob = new Blob(["zip"]);
    vi.mocked(spritesApi.downloadSpriteBuild).mockResolvedValue({ blob, filename: "spr-sprite-v2.zip" });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Download sprite v2 from/ }));
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "spr-sprite-v2.zip"));
    expect(spritesApi.downloadSpriteBuild).toHaveBeenCalledWith("p1", "b2");
  });

  it("shows a message when the download fails", async () => {
    vi.mocked(spritesApi.downloadSpriteBuild).mockRejectedValue(new ApiError("Build not found", 404));
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Download sprite v2 from/ }));
    expect(await screen.findByText("Build not found")).toBeInTheDocument();
    expect(zip.triggerBrowserDownload).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("asks first, then deletes and reloads", async () => {
    vi.mocked(spritesApi.deleteSpriteBuild).mockResolvedValue(undefined);
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /^Delete sprite v1 from/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete sprite version 1?" });
    expect(spritesApi.deleteSpriteBuild).not.toHaveBeenCalled();
    vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue([builds[0] as SpriteBuildSummary]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(spritesApi.deleteSpriteBuild).toHaveBeenCalledWith("p1", "b1");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  });

  it("has no delete buttons for people who cannot edit", async () => {
    setup({ canEdit: false });
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Download/ })).toHaveLength(2);
  });
});
