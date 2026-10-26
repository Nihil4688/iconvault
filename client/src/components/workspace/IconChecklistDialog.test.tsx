// Tests for the icon checklist shown before a sprite or font is generated: what is ticked at the start, search, folder filter, grouped and flat views, the All and Selected views, select and deselect for what is shown and for one folder, collapsing, counts, limits, errors, and what is handed back.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import { makeFolder, makeIcon } from "../../test/fixtures";
import IconChecklistDialog, { type ChecklistMode } from "./IconChecklistDialog";

vi.mock("../../api/icons");
const listIcons = vi.mocked(iconsApi.listIcons);

const folders = [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "arrows", name: "Arrows", parentId: "ui" }), makeFolder({ id: "empty", name: "Empty" })];
const icons = [
  makeIcon({ id: "home", name: "Home", slug: "home", folderId: "ui", tags: ["nav"] }),
  makeIcon({ id: "left", name: "Left", slug: "left", folderId: "arrows", tags: ["arrow"] }),
  makeIcon({ id: "right", name: "Right", slug: "right", folderId: "arrows", tags: ["arrow"] }),
  makeIcon({ id: "star", name: "Star", slug: "star", folderId: null }),
];

function setup(over: { mode?: ChecklistMode; initialIds?: string[] | null } = {}) {
  const props = { onClose: vi.fn(), onConfirm: vi.fn() };
  render(<IconChecklistDialog open mode={over.mode ?? "sprite"} projectId="p1" folders={folders} initialIds={over.initialIds === undefined ? null : over.initialIds} {...props} />);
  return props;
}
const dialog = () => screen.getByRole("dialog");
const row = (name: RegExp | string) => within(dialog()).getByRole("checkbox", { name });
const ready = () => within(dialog()).findByText(/icons selected for the/);

beforeEach(() => {
  vi.resetAllMocks();
  listIcons.mockResolvedValue({ icons, total: icons.length, page: 1, limit: 1000 });
});

describe("opening", () => {
  it("is titled for a sprite or a font, shows a busy state, then the icons", async () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Choose icons for the sprite" })).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Loading icons")).toHaveAttribute("aria-busy", "true");
    expect(await ready()).toHaveTextContent("4 of 4 icons selected for the sprite");
    expect(within(dialog()).getByText("SVG sprite")).toBeInTheDocument();
  });

  it("is titled for a font", async () => {
    setup({ mode: "font" });
    expect(screen.getByRole("dialog", { name: "Choose icons for the font" })).toBeInTheDocument();
    await ready();
    expect(within(dialog()).getByRole("button", { name: "Build font (4 icons)" })).toBeInTheDocument();
    expect(within(dialog()).getByText("Icon font")).toBeInTheDocument();
  });

  it("ticks every icon when nothing was selected before", async () => {
    setup();
    await ready();
    for (const name of ["Home", "Left", "Right", "Star"]) expect(row(new RegExp(name))).toBeChecked();
  });

  it("ticks only the icons that were selected, ignoring ids that no longer exist", async () => {
    setup({ initialIds: ["left", "star", "gone"] });
    expect(await ready()).toHaveTextContent("2 of 4 icons selected");
    expect(row(/Left/)).toBeChecked();
    expect(row(/Home/)).not.toBeChecked();
  });

  it("shows an error with a retry", async () => {
    listIcons.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    setup();
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Try again" }));
    expect(await ready()).toBeInTheDocument();
  });

  it("says when the project has no icons and cannot generate", async () => {
    listIcons.mockResolvedValue({ icons: [], total: 0, page: 1, limit: 1000 });
    setup();
    expect(await within(dialog()).findByText("This project has no icons yet.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Build sprite (0 icons)" })).toBeDisabled();
  });

  it("fetches every page of a large project", async () => {
    const first = Array.from({ length: 2 }, (_, i) => makeIcon({ id: `a${i}`, name: `A${i}`, slug: `a${i}` }));
    listIcons.mockResolvedValueOnce({ icons: first, total: 3, page: 1, limit: 1000 }).mockResolvedValueOnce({ icons: [makeIcon({ id: "b", name: "B", slug: "b" })], total: 3, page: 2, limit: 1000 });
    setup();
    expect(await ready()).toHaveTextContent("3 of 3");
  });
});

describe("grouping by folder", () => {
  it("groups icons under their folder path, then the uncategorized ones, and hides empty folders", async () => {
    setup();
    await ready();
    const groups = within(dialog()).getAllByRole("region").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["UI", "UI / Arrows", "Uncategorized"]);
    expect(within(within(dialog()).getByRole("region", { name: "UI / Arrows" })).getByText("(2 icons)")).toBeInTheDocument();
  });

  it("selects and deselects a whole folder, showing a partial state", async () => {
    setup();
    await ready();
    const arrows = within(dialog()).getByRole("region", { name: "UI / Arrows" });
    await userEvent.click(within(arrows).getByRole("button", { name: "Deselect folder" }));
    expect(within(arrows).getByText("0 of 2 selected")).toBeInTheDocument();
    expect(await ready()).toHaveTextContent("2 of 4");
    await userEvent.click(row(/Left/));
    const folderBox = within(arrows).getByRole("checkbox", { name: "Select all in UI / Arrows" }) as HTMLInputElement;
    expect(folderBox.indeterminate).toBe(true);
    await userEvent.click(within(arrows).getByRole("button", { name: "Select folder" }));
    expect(within(arrows).getByText("2 of 2 selected")).toBeInTheDocument();
    await userEvent.click(folderBox);
    expect(within(arrows).getByText("0 of 2 selected")).toBeInTheDocument();
  });

  it("collapses and expands a folder", async () => {
    setup();
    await ready();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Collapse UI / Arrows" }));
    expect(within(dialog()).queryByRole("checkbox", { name: /Left/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Expand UI / Arrows" }));
    expect(row(/Left/)).toBeInTheDocument();
  });

  it("can show a flat list instead", async () => {
    setup();
    await ready();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Group by folder" }));
    expect(within(dialog()).queryAllByRole("region")).toHaveLength(0);
    expect(within(dialog()).getAllByRole("checkbox").length).toBeGreaterThanOrEqual(4);
  });
});

describe("finding and choosing", () => {
  it("filters by name or tag, and select all and deselect all apply to what is shown", async () => {
    setup();
    await ready();
    await userEvent.type(within(dialog()).getByLabelText("Filter the checklist by icon name or tag"), "arrow");
    expect(within(dialog()).queryByRole("checkbox", { name: /Home/ })).not.toBeInTheDocument();
    expect(row(/Left/)).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Deselect all" }));
    expect(await ready()).toHaveTextContent("2 of 4");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Select all (2)" }));
    expect(await ready()).toHaveTextContent("4 of 4");
  });

  it("says when nothing matches", async () => {
    setup();
    await ready();
    await userEvent.type(within(dialog()).getByLabelText("Filter the checklist by icon name or tag"), "zzz");
    expect(within(dialog()).getByText("No icons match.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Select all (0)" })).toBeDisabled();
  });

  it("filters by folder including its subfolders, or by uncategorized", async () => {
    setup();
    await ready();
    await userEvent.selectOptions(within(dialog()).getByLabelText("Folder"), "ui");
    expect(within(dialog()).queryByRole("checkbox", { name: /Star/ })).not.toBeInTheDocument();
    expect(row(/Left/)).toBeInTheDocument();
    expect(row(/Home/)).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog()).getByLabelText("Folder"), "root");
    expect(row(/Star/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole("checkbox", { name: /Home/ })).not.toBeInTheDocument();
  });

  it("switches between All and Selected, which shows only the ticked icons", async () => {
    setup({ initialIds: ["home", "star"] });
    await ready();
    expect(within(dialog()).getByRole("button", { name: "All (4)" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Selected (2)" }));
    expect(within(dialog()).queryByRole("checkbox", { name: /Left/ })).not.toBeInTheDocument();
    expect(row(/Home/)).toBeInTheDocument();
    await userEvent.click(row(/Home/));
    await userEvent.click(row(/Star/));
    expect(within(dialog()).getByText("Nothing is selected.")).toBeInTheDocument();
  });
});

describe("generating", () => {
  it("hands back the ticked ids in project order and shows the count on the button", async () => {
    const p = setup();
    await ready();
    await userEvent.click(row(/Home/));
    const go = within(dialog()).getByRole("button", { name: "Build sprite (3 icons)" });
    expect(within(dialog()).getByText("Ready to build with 3 icons.")).toBeInTheDocument();
    await userEvent.click(go);
    expect(p.onConfirm).toHaveBeenCalledWith(["left", "right", "star"]);
  });

  it("cannot generate with nothing ticked", async () => {
    setup();
    await ready();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Deselect all" }));
    expect(within(dialog()).getByRole("button", { name: "Build sprite (0 icons)" })).toBeDisabled();
    expect(within(dialog()).getByText("Tick at least one icon.")).toBeInTheDocument();
  });

  it("refuses more than 1000 icons for a font", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => makeIcon({ id: `i${i}`, name: `N${i}`, slug: `n${i}` }));
    listIcons.mockResolvedValue({ icons: many.slice(0, 1000), total: 1001, page: 1, limit: 1000 });
    listIcons.mockResolvedValueOnce({ icons: many.slice(0, 1000), total: 1001, page: 1, limit: 1000 }).mockResolvedValueOnce({ icons: many.slice(1000), total: 1001, page: 2, limit: 1000 });
    setup({ mode: "font" });
    expect(await within(dialog()).findByRole("alert", {}, { timeout: 10000 })).toHaveTextContent("1000 icons at most");
    expect(within(dialog()).getByRole("button", { name: /Build font/ })).toBeDisabled();
  }, 30000);

  it("closes with Cancel without handing anything back", async () => {
    const p = setup();
    await ready();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onConfirm).not.toHaveBeenCalled();
  });
});
