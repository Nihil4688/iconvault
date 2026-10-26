// Tests for the Trash and Settings sections: listing, restoring (with notes about changes), deleting for good, emptying, editing, archiving and deleting a project, and the read-only views.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import * as iconsApi from "../../api/icons";
import * as projectsApi from "../../api/projects";
import { ToastProvider } from "../../context/ToastContext";
import { WorkspaceContext, type WorkspaceContextValue } from "../../context/workspaceContext";
import { READ_ONLY, makeDetail, makeIcon } from "../../test/fixtures";
import * as clipboard from "../../lib/clipboard";
import * as zip from "../../utils/zipBundle";
import SettingsTab from "./SettingsTab";
import TrashTab from "./TrashTab";

const auth = { currentUser: { id: "u1", displayName: "Ada", email: "ada@example.com", role: "user" } };
vi.mock("../../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../utils/zipBundle", () => ({ triggerBrowserDownload: vi.fn() }));
vi.mock("../admin/TransferProjectDialog", () => ({ default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Transfer ownership" /> : null) }));
vi.mock("../../api/icons");
vi.mock("../../api/projects");
vi.mock("../../lib/clipboard");

const listIcons = vi.mocked(iconsApi.listIcons);
const trashed = (id: string, name: string) => makeIcon({ id, name, deletedAt: "2026-10-18T10:00:00.000Z" });

function setup(node: React.ReactNode, over: Partial<WorkspaceContextValue> = {}) {
  const fns = { selectFolder: vi.fn(), refreshProject: vi.fn(), refreshFolders: vi.fn(), refreshIcons: vi.fn() };
  const value: WorkspaceContextValue = { project: makeDetail({ id: "p1", name: "Feather", iconCount: 3 }), folderList: { folders: [], uncategorizedCount: 0 }, selectedFolder: "all", iconsVersion: 0, ...fns, ...over };
  render(
    <MemoryRouter initialEntries={["/projects/p1/x"]}>
      <ToastProvider>
        <WorkspaceContext.Provider value={value}>
          <Routes>
            <Route path="/" element={<p>Dashboard</p>} />
            <Route path="/projects/p1/x" element={node} />
          </Routes>
        </WorkspaceContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return fns;
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  auth.currentUser.role = "user";
});

describe("Trash", () => {
  beforeEach(() => listIcons.mockResolvedValue({ icons: [trashed("a", "Alpha"), trashed("b", "Beta")], total: 2, page: 1, limit: 1000 }));

  it("lists trashed icons from the server", async () => {
    setup(<TrashTab />);
    expect(screen.getByLabelText("Loading trash")).toBeInTheDocument();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(listIcons).toHaveBeenCalledWith("p1", { trash: true, sort: "newest", limit: 1000 });
    expect(screen.getByText("2 icons in the trash")).toBeInTheDocument();
  });

  it("says the trash is empty", async () => {
    listIcons.mockResolvedValue({ icons: [], total: 0, page: 1, limit: 1000 });
    setup(<TrashTab />);
    expect(await screen.findByText("The trash is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empty trash" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    listIcons.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    setup(<TrashTab />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });

  it("restores one icon and refreshes everything", async () => {
    vi.mocked(iconsApi.restoreIcon).mockResolvedValue({ icon: makeIcon({ id: "a" }), adjusted: [] });
    const fns = setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore Alpha" }));
    expect(iconsApi.restoreIcon).toHaveBeenCalledWith("a");
    expect(await screen.findByText("Restored “Alpha”.")).toBeInTheDocument();
    expect(fns.refreshIcons).toHaveBeenCalled();
    expect(fns.refreshFolders).toHaveBeenCalled();
    expect(fns.refreshProject).toHaveBeenCalled();
    await waitFor(() => expect(listIcons).toHaveBeenCalledTimes(2));
  });

  it("tells what changed when a restore had to adjust the icon", async () => {
    vi.mocked(iconsApi.restoreIcon).mockResolvedValue({ icon: makeIcon({ id: "a" }), adjusted: ["Its codepoint was taken."] });
    setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore Alpha" }));
    expect(await screen.findByText(/Its codepoint was taken\./)).toBeInTheDocument();
  });

  it("restores everything", async () => {
    vi.mocked(iconsApi.batchRestoreIcons).mockResolvedValue({ requested: 2, matched: 2, adjusted: [] });
    setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore all" }));
    expect(iconsApi.batchRestoreIcons).toHaveBeenCalledWith("p1", ["a", "b"]);
    expect(await screen.findByText("Restored 2 icons.")).toBeInTheDocument();
  });

  it("reports a failed restore", async () => {
    vi.mocked(iconsApi.restoreIcon).mockRejectedValue(new ApiError("Icon not found.", 404));
    setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Restore Alpha" }));
    expect(await screen.findByText("Icon not found.")).toBeInTheDocument();
  });

  it("asks before deleting one icon for good", async () => {
    vi.mocked(iconsApi.deleteIcon).mockResolvedValue({});
    const fns = setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete forever: Alpha" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Alpha” forever?" });
    expect(iconsApi.deleteIcon).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete forever" }));
    expect(iconsApi.deleteIcon).toHaveBeenCalledWith("a", { permanent: true });
    expect(await screen.findByText("Deleted “Alpha” for good.")).toBeInTheDocument();
    expect(fns.refreshProject).toHaveBeenCalled();
  });

  it("can be cancelled without deleting", async () => {
    setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Empty the trash?" })).getByRole("button", { name: "Cancel" }));
    expect(iconsApi.emptyTrash).not.toHaveBeenCalled();
  });

  it("empties the trash after confirmation", async () => {
    vi.mocked(iconsApi.emptyTrash).mockResolvedValue({ deleted: 2 });
    setup(<TrashTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Empty the trash?" })).getByRole("button", { name: "Empty trash" }));
    expect(iconsApi.emptyTrash).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Deleted 2 icons for good.")).toBeInTheDocument();
  });

  it("is for editors only and asks the server for nothing otherwise", async () => {
    setup(<TrashTab />, { project: makeDetail({ id: "p1", access: READ_ONLY }) });
    expect(await screen.findByText("Only the owner can see this project’s trash.")).toBeInTheDocument();
    expect(listIcons).not.toHaveBeenCalled();
  });
});

describe("Settings", () => {
  it("shows the project's settings in a form, with the type fixed and the owner named", () => {
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", name: "Feather", prefix: "fth", description: "Line icons", purpose: "font", visibility: "public", owner: { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com" } }) });
    expect(screen.getByRole("heading", { name: "Project settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveValue("Feather");
    expect(screen.getByLabelText("Description")).toHaveValue("Line icons");
    expect(screen.getByLabelText(/CSS \/ symbol prefix/)).toHaveValue("fth");
    expect(screen.getByRole("radio", { name: /Public project/ })).toBeChecked();
    expect(screen.getByText("Icon font project")).toBeInTheDocument();
    expect(screen.getByText(/Permanent \(cannot be changed\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ada Lovelace \(ada@example.com\)/)).toBeInTheDocument();
  });

  it("has Save settings at the top, before the fields, switched on only after a change", async () => {
    setup(<SettingsTab />);
    const save = screen.getByRole("button", { name: "Save settings" });
    expect(save).toBeDisabled();
    expect(save.className).toContain("bg-primary");
    expect(save.compareDocumentPosition(screen.getByLabelText("Project name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Project name"), "!");
    expect(save).toBeEnabled();
  });

  it("saves the changed settings and refreshes the project", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ id: "p1", name: "Feather 2" }));
    const fns = setup(<SettingsTab />);
    const name = screen.getByLabelText("Project name");
    await userEvent.clear(name);
    await userEvent.type(name, "Feather 2");
    await userEvent.click(screen.getByRole("radio", { name: /Public project/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(projectsApi.updateProject).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Feather 2", visibility: "public" })));
    expect(await screen.findByText("Saved “Feather 2”.")).toBeInTheDocument();
    expect(fns.refreshProject).toHaveBeenCalled();
  });

  it("checks the name and prefix before saving", async () => {
    setup(<SettingsTab />);
    await userEvent.clear(screen.getByLabelText("Project name"));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(projectsApi.updateProject).not.toHaveBeenCalled();
  });

  it("shows the reason when saving fails", async () => {
    vi.mocked(projectsApi.updateProject).mockRejectedValue(new ApiError("Could not save.", 500));
    setup(<SettingsTab />);
    await userEvent.type(screen.getByLabelText("Project name"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save.");
  });

  it("gives the usage snippets for the project type, with a copy button", async () => {
    vi.mocked(clipboard.copyText).mockResolvedValue(true);
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", name: "Feather", prefix: "fth", purpose: "sprite" }) });
    expect(screen.getByRole("heading", { name: /Integration guide/ })).toBeInTheDocument();
    expect(screen.getByText(/sprite.svg#fth-home/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy: SVG sprite inline usage" }));
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('href="sprite.svg#fth-home"'));
    expect(await screen.findByText("Copied svg sprite inline usage.")).toBeInTheDocument();
  });

  it("gives font snippets for a font project", () => {
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", name: "Feather Icons", prefix: "fth", purpose: "font" }) });
    expect(screen.getByText(/FeatherIcons\.css/)).toBeInTheDocument();
    expect(screen.getByText(/<i className="fth-home"/)).toBeInTheDocument();
  });

  it("marks a project as a draft", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ id: "p1" }));
    const fns = setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Mark as draft" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("p1", { isArchived: true });
    expect(await screen.findByText("Marked “Feather” as draft.")).toBeInTheDocument();
    expect(fns.refreshProject).toHaveBeenCalled();
  });

  it("offers to mark a draft as active", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ id: "p1" }));
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", name: "Feather", isArchived: true }) });
    await userEvent.click(screen.getByRole("button", { name: "Mark as active" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("p1", { isArchived: false });
  });

  it("reports a failed change to draft", async () => {
    vi.mocked(projectsApi.updateProject).mockRejectedValue(new ApiError("Nope.", 403));
    setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Mark as draft" }));
    expect(await screen.findByText("Nope.")).toBeInTheDocument();
  });

  it("asks before deleting, then returns to the dashboard", async () => {
    vi.mocked(projectsApi.deleteProject).mockResolvedValue({ deletedIcons: 3, deletedFolders: 0 });
    setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Feather”?" });
    expect(projectsApi.deleteProject).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
    expect(projectsApi.deleteProject).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("keeps the dialog open and shows why when deleting fails", async () => {
    vi.mocked(projectsApi.deleteProject).mockRejectedValue(new ApiError("Could not delete.", 500));
    setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete project" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Could not delete.");
  });

  it("exports the project as a ZIP for anyone who can see it", async () => {
    const blob = new Blob(["z"]);
    vi.mocked(projectsApi.exportProject).mockResolvedValue({ blob, filename: "feather-export.zip" });
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", access: READ_ONLY }) });
    await userEvent.click(screen.getByRole("button", { name: "Export project" }));
    expect(projectsApi.exportProject).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(zip.triggerBrowserDownload).toHaveBeenCalledWith(blob, "feather-export.zip"));
  });

  it("reports a failed export", async () => {
    vi.mocked(projectsApi.exportProject).mockRejectedValue(new ApiError("Project not found.", 404));
    setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Export project" }));
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
  });

  it("offers ownership transfer to admins only", async () => {
    setup(<SettingsTab />);
    expect(screen.queryByRole("button", { name: "Transfer ownership" })).not.toBeInTheDocument();
  });

  it("opens the transfer dialog for an admin", async () => {
    auth.currentUser.role = "admin";
    setup(<SettingsTab />);
    await userEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(screen.getByRole("dialog", { name: "Transfer ownership" })).toBeInTheDocument();
  });

  it("is read-only for viewers", () => {
    setup(<SettingsTab />, { project: makeDetail({ id: "p1", access: READ_ONLY }) });
    expect(screen.getByText("Only the owner can change these settings.")).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeDisabled();
    for (const name of ["Save settings", "Mark as draft", "Delete project"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });
});
