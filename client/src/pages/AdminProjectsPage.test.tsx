// Tests for Manage Projects (admins only) and the Manage menu in the top bar: who can open them, the list with owners, search by owner, opening, transferring and deleting a project, and the menu's keyboard behaviour.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http";
import * as adminApi from "../api/admin";
import * as projectsApi from "../api/projects";
import ManageMenu from "../components/shell/ManageMenu";
import { ToastProvider } from "../context/ToastContext";
import { makeProject } from "../test/fixtures";
import AdminProjectsPage from "./AdminProjectsPage";

const auth = { currentUser: { id: "u0", displayName: "Admin", email: "admin@example.com", role: "admin" } };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../api/projects");
vi.mock("../api/admin");

const listProjects = vi.mocked(projectsApi.listProjects);
const reply = (projects: ReturnType<typeof makeProject>[], total = projects.length) => ({ projects, total, page: 1, limit: 25 });
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderPage(path = "/admin/projects") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/admin" element={<p>Users page</p>} />
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/projects/:id" element={<p>Project page</p>} />
        </Routes>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adminApi.getAdminStats).mockResolvedValue({ users: 5, admins: 1, members: 4, googleUsers: 3, microsoftUsers: 1, projects: 7, publicProjects: 3, privateProjects: 4, spriteProjects: 4, fontProjects: 3, draftProjects: 1, icons: 42, fontBuilds: 2, activeTokens: 3 });
  auth.currentUser.role = "admin";
  listProjects.mockResolvedValue(
    reply([
      makeProject({ id: "p1", name: "Feather", prefix: "fth", visibility: "private", purpose: "font", iconCount: 7, owner: { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com" } }),
      makeProject({ id: "p2", name: "Old set", prefix: "old", visibility: "public", isArchived: true, iconCount: 2, owner: { id: "u2", displayName: "Bob", email: "bob@example.com" } }),
    ]),
  );
});

describe("Manage projects", () => {
  it("sends anyone who is not an admin to the dashboard", async () => {
    auth.currentUser.role = "user";
    renderPage();
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("lists every project with its owner, badges and counts, asking for all of them", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Projects" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("Private")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 projects");
    expect(listProjects).toHaveBeenCalledWith({ status: "all", scope: "all", sort: "updated", page: 1, limit: 25 });
  });

  it("has a small breadcrumb back to the dashboard", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/");
  });

  it("shows the Users and Projects tabs with Projects current", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    const nav = screen.getByRole("navigation", { name: "Administration sections" });
    expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("link", { name: "Users" }));
    expect(await screen.findByText("Users page")).toBeInTheDocument();
  });

  it("searches, including by owner", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "ada@example.com");
    await waitFor(() => expect(listProjects).toHaveBeenLastCalledWith({ status: "all", scope: "all", sort: "updated", search: "ada@example.com", page: 1, limit: 25 }));
  });

  it("says when nothing matches", async () => {
    listProjects.mockResolvedValue(reply([]));
    renderPage();
    expect(await screen.findByText("There are no projects.")).toBeInTheDocument();
  });

  it("shows why the list could not load and tries again", async () => {
    listProjects.mockRejectedValueOnce(new ApiError("Could not load.", 500));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Projects" })).toBeInTheDocument();
  });

  it("opens a project", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: "Open Feather" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p1");
  });

  it("asks first, then deletes a project and reloads", async () => {
    vi.mocked(projectsApi.deleteProject).mockResolvedValue({ deletedIcons: 7, deletedFolders: 0 });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete Feather" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Feather”?" });
    expect(dialog).toHaveTextContent("Ada Lovelace");
    expect(projectsApi.deleteProject).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
    expect(projectsApi.deleteProject).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Deleted “Feather”.")).toBeInTheDocument();
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2));
  });

  it("opens the transfer dialog for a project", async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue({ users: [], total: 0, page: 1, limit: 100 });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Transfer Feather" }));
    expect(await screen.findByRole("dialog", { name: "Transfer ownership" })).toBeInTheDocument();
  });
});

describe("totals, owner filter and bulk actions", () => {
  it("shows only project numbers: total, private, public, sprite, font and drafts", async () => {
    renderPage();
    const totals = await screen.findByRole("region", { name: "Project totals" });
    expect(await within(totals).findByText("Sprite projects")).toBeInTheDocument();
    expect([...totals.querySelectorAll("p.text-xs")].map((p) => p.textContent)).toEqual(["Projects", "Private", "Public", "Sprite projects", "Font projects", "Drafts"]);
    expect([...totals.querySelectorAll("p.text-xl")].map((p) => p.textContent)).toEqual(["7", "4", "3", "4", "3", "1"]);
    expect(screen.queryByRole("region", { name: "User totals" })).not.toBeInTheDocument();
  });

  it("shows one owner's projects from the address, with a way back to everyone's", async () => {
    renderPage("/admin/projects?owner=u1");
    expect(await screen.findByText("Ada Lovelace", { selector: "span.font-semibold" })).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledWith({ status: "all", scope: "all", sort: "updated", owner: "u1", page: 1, limit: 25 });
    await userEvent.click(screen.getByRole("button", { name: "Show every owner's projects" }));
    await waitFor(() => expect(listProjects).toHaveBeenLastCalledWith({ status: "all", scope: "all", sort: "updated", page: 1, limit: 25 }));
    expect(screen.queryByRole("button", { name: "Show every owner's projects" })).not.toBeInTheDocument();
  });

  it("ticks projects and shows how many are selected, with select all and clear", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    expect(screen.queryByRole("region", { name: "Selected projects" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Feather" }));
    expect(within(screen.getByRole("region", { name: "Selected projects" })).getByText("1 project selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all projects on this page" }));
    expect(screen.getByText("2 projects selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("region", { name: "Selected projects" })).not.toBeInTheDocument();
  });

  it("deletes the ticked projects after asking, and reloads the list and the totals", async () => {
    vi.mocked(adminApi.bulkDeleteProjects).mockResolvedValue({ requested: 2, done: 2, failed: [], deletedIcons: 9 });
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all projects on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = screen.getByRole("dialog", { name: "Delete 2 projects?" });
    expect(dialog).toHaveTextContent("“Feather”, “Old set”");
    expect(adminApi.bulkDeleteProjects).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete projects" }));
    expect(adminApi.bulkDeleteProjects).toHaveBeenCalledWith(["p1", "p2"]);
    expect(await screen.findByText("Deleted 2 projects.")).toBeInTheDocument();
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(adminApi.getAdminStats).toHaveBeenCalledTimes(2));
  });

  it("transfers the ticked projects to one user and reports the ones that could not move", async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue({ users: [{ id: "u9", displayName: "Grace", email: "grace@example.com", provider: "google", picture: null, createdAt: "2026-10-01T10:00:00.000Z", lastLoginAt: null, projectCount: 0, iconCount: 0, activeTokens: 0, isAdmin: false, isSelf: false }], total: 1, page: 1, limit: 100 });
    vi.mocked(adminApi.bulkTransferProjects).mockResolvedValue({ requested: 2, done: 1, failed: [{ id: "p2", name: "Old set", message: "That user already owns this project." }] });
    renderPage();
    await screen.findByRole("table", { name: "Projects" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all projects on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Transfer selected" }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer projects" });
    await within(dialog).findByRole("option", { name: "Grace (grace@example.com)" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Transfer" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose the new owner.");
    await userEvent.selectOptions(within(dialog).getByLabelText("New owner"), "u9");
    await userEvent.click(within(dialog).getByRole("button", { name: "Transfer" }));
    expect(adminApi.bulkTransferProjects).toHaveBeenCalledWith(["p1", "p2"], "u9");
    expect(await screen.findByText(/Moved 1 project to Grace; 1 could not move \(That user already owns this project\.\)/)).toBeInTheDocument();
  });
});

describe("the Manage menu", () => {
  function renderMenu() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ManageMenu />
        <Where />
      </MemoryRouter>,
    );
  }

  it("lists Manage Projects and Manage Users with what each does", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Manage" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Admin tools" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Manage ProjectsView all projects, owners, transfer & delete",
      "Manage UsersSee who signed in, their projects, and remove users",
    ]);
  });

  it("goes to the chosen screen and closes", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Manage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Manage Projects/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/projects");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Manage" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Manage Users/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
  });

  it("moves with the arrow keys and closes on Escape or an outside click", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Manage" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Manage Projects/ })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Manage Users/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Manage Projects/ })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
