// Tests for the dialogs that add icons: upload (files, drag and drop, batching, results, failures), paste, and copying from another project.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import * as projectsApi from "../../api/projects";
import type { UploadSummary } from "../../api/types";
import { READ_ONLY, makeFolder, makeIcon, makeProject } from "../../test/fixtures";
import CopyFromProjectDialog from "./CopyFromProjectDialog";
import UploadDialog from "./UploadDialog";

vi.mock("../../api/icons");
vi.mock("../../api/projects");

const uploadIcons = vi.mocked(iconsApi.uploadIcons);
const pasteIcon = vi.mocked(iconsApi.pasteIcon);

const summary = (over: Partial<UploadSummary> = {}): UploadSummary => ({ created: [], replaced: [], skipped: [], errors: [], foldersCreated: 0, ...over });
const svgFile = (name: string, text = "<svg/>") => new File([text], name, { type: "image/svg+xml", lastModified: Math.random() });

const folders = [makeFolder({ id: "ui", name: "UI" }), makeFolder({ id: "ar", name: "Arrows", parentId: "ui" })];

beforeEach(() => vi.resetAllMocks());

describe("UploadDialog: files", () => {
  function setup(over: Partial<React.ComponentProps<typeof UploadDialog>> = {}) {
    const props = { open: true, projectId: "p1", folders, defaultFolderId: null, onClose: vi.fn(), onUploaded: vi.fn(), onPasted: vi.fn(), ...over };
    render(<UploadDialog {...props} />);
    return props;
  }
  const input = () => screen.getByTestId("file-input") as HTMLInputElement;

  it("starts on the files tab with nothing to upload", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Add icons" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload files" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Add files" })).toBeDisabled();
  });

  it("lists chosen files, reports unsupported ones, and lets a file be removed", async () => {
    setup();
    // The picker normally hides other types, but files can also be dragged in, so the code must refuse them itself.
    await userEvent.setup({ applyAccept: false }).upload(input(), [svgFile("a.svg"), svgFile("b.svg"), new File(["x"], "notes.txt")]);
    const list = screen.getByRole("list", { name: "Files to add" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Files not accepted" })).toHaveTextContent("notes.txt: Only .svg and .zip files can be added.");
    expect(screen.getByRole("button", { name: "Add 2 files" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Remove a.svg" }));
    expect(within(screen.getByRole("list", { name: "Files to add" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add 1 file" })).toBeEnabled();
  });

  it("accepts files dropped on the drop area", () => {
    setup();
    const zone = screen.getByText("Drag SVG files and ZIP archives here").parentElement as HTMLElement;
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    fireEvent.drop(zone, { dataTransfer: { files: [svgFile("dropped.svg")] } });
    expect(screen.getByText("dropped.svg")).toBeInTheDocument();
  });

  it("uploads with the chosen options and then shows the result", async () => {
    uploadIcons.mockResolvedValue(summary({ created: [makeIcon(), makeIcon()], replaced: [makeIcon()], skipped: [{ name: "Old", reason: "An icon with that name already exists." }], foldersCreated: 2 }));
    const props = setup({ defaultFolderId: "ui" });
    await userEvent.upload(input(), [svgFile("a.svg"), svgFile("b.svg")]);
    expect(screen.getByLabelText("Folder")).toHaveValue("ui");
    await userEvent.selectOptions(screen.getByLabelText("If an icon with that name exists"), "skip");
    await userEvent.click(screen.getByLabelText("Optimize to make the files smaller"));
    await userEvent.type(screen.getByLabelText("Tags"), "UI, Nav");
    await userEvent.click(screen.getByRole("button", { name: "Add 2 files" }));

    expect(uploadIcons).toHaveBeenCalledTimes(1);
    const [projectId, sent, options] = uploadIcons.mock.calls[0] as [string, File[], object];
    expect(projectId).toBe("p1");
    expect(sent.map((f) => f.name)).toEqual(["a.svg", "b.svg"]);
    expect(options).toEqual({ folderId: "ui", strategy: "skip", optimize: false, tags: ["ui", "nav"] });

    const result = await screen.findByRole("status");
    expect(result).toHaveTextContent("Added 2 icons.");
    expect(result).toHaveTextContent("1 icon replaced.");
    expect(result).toHaveTextContent("1 icon skipped.");
    expect(result).toHaveTextContent("2 folders created from the ZIP.");
    expect(screen.getByText("Old: An icon with that name already exists.")).toBeInTheDocument();
    expect(props.onUploaded).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows every file that could not be added, with the reason", async () => {
    uploadIcons.mockResolvedValue(summary({ created: [makeIcon()], errors: [{ file: "broken.svg", message: "Invalid SVG: the markup could not be parsed." }, { file: "UI/x.svg", message: "Larger than 1 MB." }] }));
    setup();
    await userEvent.upload(input(), svgFile("a.svg"));
    await userEvent.click(screen.getByRole("button", { name: /^Add 1 file/ }));
    const section = await screen.findByRole("region", { name: "Files that could not be added" });
    expect(within(section).getByText("broken.svg")).toBeInTheDocument();
    expect(within(section).getByText("Invalid SVG: the markup could not be parsed.")).toBeInTheDocument();
    expect(within(section).getByText("UI/x.svg")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 files could not be added.");
  });

  it("says plainly when nothing new was added", async () => {
    uploadIcons.mockResolvedValue(summary({ skipped: [{ name: "a", reason: "An icon with that name already exists." }] }));
    setup();
    await userEvent.upload(input(), svgFile("a.svg"));
    await userEvent.click(screen.getByRole("button", { name: /^Add 1 file/ }));
    expect(await screen.findByText("Nothing new was added.")).toBeInTheDocument();
  });

  it("sends a large selection in batches of 100 and combines the results", async () => {
    uploadIcons.mockImplementation(async (_id, files) => summary({ created: files.map((f) => makeIcon({ name: f.name })), foldersCreated: 1 }));
    const props = setup();
    await userEvent.upload(input(), Array.from({ length: 250 }, (_, i) => svgFile(`i${i}.svg`)));
    await userEvent.click(screen.getByRole("button", { name: "Add 250 files" }));
    expect(await screen.findByText("Added 250 icons.")).toBeInTheDocument();
    expect(uploadIcons.mock.calls.map((call) => (call[1] as File[]).length)).toEqual([100, 100, 50]);
    expect(screen.getByRole("status")).toHaveTextContent("3 folders created");
    expect(props.onUploaded).toHaveBeenCalledWith(expect.objectContaining({ foldersCreated: 3 }));
  });

  it("keeps what was uploaded and says what was not when a later batch fails", async () => {
    uploadIcons.mockResolvedValueOnce(summary({ created: Array.from({ length: 100 }, () => makeIcon()) })).mockRejectedValue(new ApiError("The server answered 500.", 500));
    const props = setup();
    await userEvent.upload(input(), Array.from({ length: 150 }, (_, i) => svgFile(`i${i}.svg`)));
    await userEvent.click(screen.getByRole("button", { name: "Add 150 files" }));
    expect(await screen.findByText("Added 100 icons.")).toBeInTheDocument();
    expect(screen.getByText("The rest of the files")).toBeInTheDocument();
    expect(screen.getByText("The server answered 500.")).toBeInTheDocument();
    expect(props.onUploaded).toHaveBeenCalledWith(expect.objectContaining({ created: expect.any(Array) }));
  });

  it("keeps the selection and shows the error when the first request fails, so it can be retried", async () => {
    uploadIcons.mockRejectedValueOnce(new ApiError("Could not reach the server.")).mockResolvedValue(summary({ created: [makeIcon()] }));
    const props = setup();
    await userEvent.upload(input(), svgFile("a.svg"));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(props.onUploaded).not.toHaveBeenCalled();
    expect(screen.getByText("a.svg")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add 1 file" }));
    expect(await screen.findByText("Added 1 icon.")).toBeInTheDocument();
  });
});

describe("UploadDialog: paste", () => {
  async function openPaste(over: Partial<React.ComponentProps<typeof UploadDialog>> = {}) {
    const props = { open: true, projectId: "p1", folders, defaultFolderId: "ar", onClose: vi.fn(), onUploaded: vi.fn(), onPasted: vi.fn(), ...over };
    render(<UploadDialog {...props} />);
    await userEvent.click(screen.getByRole("tab", { name: "Paste SVG code" }));
    return props;
  }

  it("needs some code first", async () => {
    await openPaste();
    await userEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Paste some SVG code first.");
    expect(pasteIcon).not.toHaveBeenCalled();
  });

  it("adds the icon with the chosen options, tells the owner, and closes", async () => {
    pasteIcon.mockResolvedValue({ outcome: "created", icon: { ...makeIcon({ name: "Arrow" }), svg: "<svg/>" } });
    const props = await openPaste();
    await userEvent.type(screen.getByLabelText("Name"), "Arrow");
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: "<svg viewBox='0 0 1 1'/>" } });
    await userEvent.type(screen.getByLabelText("Tags"), "shape");
    await userEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(pasteIcon).toHaveBeenCalledWith("p1", { rawSvg: "<svg viewBox='0 0 1 1'/>", name: "Arrow", folderId: "ar", optimize: true, tags: ["shape"], strategy: "rename" });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onPasted).toHaveBeenCalledWith(expect.objectContaining({ outcome: "created" }));
  });

  it("falls back to a default name", async () => {
    pasteIcon.mockResolvedValue({ outcome: "created", icon: { ...makeIcon(), svg: "<svg/>" } });
    await openPaste();
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: "<svg/>" } });
    await userEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(pasteIcon).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Pasted icon" }));
  });

  it("explains a skipped icon without closing", async () => {
    pasteIcon.mockResolvedValue({ outcome: "skipped", reason: "An icon with that name already exists." });
    const props = await openPaste();
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: "<svg/>" } });
    await userEvent.selectOptions(screen.getByLabelText("If an icon with that name exists"), "skip");
    await userEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(await screen.findByRole("status")).toHaveTextContent("An icon with that name already exists.");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("shows the server's message when the SVG is refused", async () => {
    pasteIcon.mockRejectedValue(new ApiError("Invalid SVG: XML entities are not permitted.", 400));
    const props = await openPaste();
    fireEvent.change(screen.getByLabelText("SVG code"), { target: { value: "<svg/>" } });
    await userEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid SVG: XML entities are not permitted.");
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("CopyFromProjectDialog", () => {
  const sources = [makeProject({ id: "p1", name: "This one" }), makeProject({ id: "s1", name: "Feather" }), makeProject({ id: "s2", name: "Shared", owner: { id: "u2", displayName: "Grace" }, access: READ_ONLY })];

  function setup(over: Partial<React.ComponentProps<typeof CopyFromProjectDialog>> = {}) {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({ projects: sources, total: 3, page: 1, limit: 100 });
    vi.mocked(iconsApi.listIcons).mockImplementation(async (projectId) => ({ icons: projectId === "s1" ? [makeIcon({ id: "a", name: "Arrow" }), makeIcon({ id: "b", name: "Bell" })] : [makeIcon({ id: "c", name: "Cloud" })], total: 2, page: 1, limit: 200 }));
    const props = { open: true, targetProjectId: "p1", targetFolders: folders, defaultFolderId: null, onClose: vi.fn(), onCopied: vi.fn(), ...over };
    render(<CopyFromProjectDialog {...props} />);
    return props;
  }

  it("offers the other projects, saying whose they are, and loads the first one's icons", async () => {
    setup();
    const select = await screen.findByLabelText("Copy from");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Feather (yours)", "Shared (by Grace)"]);
    expect(await screen.findByRole("checkbox", { name: "Arrow" })).toBeInTheDocument();
    expect(iconsApi.listIcons).toHaveBeenCalledWith("s1", { sort: "name", limit: 200 });
  });

  it("copies the ticked icons into the chosen folder", async () => {
    vi.mocked(iconsApi.copyIcons).mockResolvedValue(summary({ created: [makeIcon()] }));
    const props = setup();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Arrow" }));
    expect(screen.getByRole("button", { name: "Copy 1 icon" })).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText("Put them in"), "ar");
    await userEvent.selectOptions(screen.getByLabelText("If an icon with that name exists"), "replace");
    await userEvent.click(screen.getByRole("button", { name: "Copy 1 icon" }));
    expect(iconsApi.copyIcons).toHaveBeenCalledWith("p1", { sourceProjectId: "s1", iconIds: ["a"], folderId: "ar", strategy: "replace" });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onCopied).toHaveBeenCalledWith(expect.objectContaining({ created: expect.any(Array) }));
  });

  it("selects all and clears", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Select all 2" }));
    expect(screen.getByText("2 icons selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 icons selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy icons" })).toBeDisabled();
  });

  it("forgets ticks when another project is chosen", async () => {
    setup();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Arrow" }));
    await userEvent.selectOptions(screen.getByLabelText("Copy from"), "s2");
    expect(await screen.findByRole("checkbox", { name: "Cloud" })).not.toBeChecked();
    expect(screen.getByText("0 icons selected")).toBeInTheDocument();
  });

  it("searches the source project's icons", async () => {
    setup();
    await screen.findByRole("checkbox", { name: "Arrow" });
    await userEvent.type(screen.getByLabelText("Search icons"), "bel");
    await waitFor(() => expect(iconsApi.listIcons).toHaveBeenLastCalledWith("s1", { sort: "name", limit: 200, search: "bel" }));
  });

  it("shows a failed copy inside the dialog", async () => {
    vi.mocked(iconsApi.copyIcons).mockRejectedValue(new ApiError("You can only change projects you own.", 403));
    const props = setup();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Arrow" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy 1 icon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can only change projects you own.");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("says so when there is no other project", async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({ projects: [sources[0] as ReturnType<typeof makeProject>], total: 1, page: 1, limit: 100 });
    render(<CopyFromProjectDialog open targetProjectId="p1" targetFolders={[]} defaultFolderId={null} onClose={vi.fn()} onCopied={vi.fn()} />);
    expect(await screen.findByText("There is no other project to copy from yet.")).toBeInTheDocument();
  });
});
