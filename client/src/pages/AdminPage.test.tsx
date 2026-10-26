// Tests for the administration screen and its dialogs: who can open it, the user list, search and paging, deleting a user with or without handing over their projects, and moving a project.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "../api/admin";
import { ApiError } from "../api/http";
import type { AdminUser } from "../api/types";
import TransferProjectDialog from "../components/admin/TransferProjectDialog";
import { ToastProvider } from "../context/ToastContext";
import { makeDetail } from "../test/fixtures";
import AdminPage from "./AdminPage";

const auth = { currentUser: { id: "u0", displayName: "Admin", email: "admin@example.com", role: "admin" } };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../api/admin");

const listUsers = vi.mocked(adminApi.listUsers);
let counter = 0;
const user = (over: Partial<AdminUser> = {}): AdminUser => {
  counter += 1;
  return { id: `u${counter}`, displayName: `User ${counter}`, email: `user${counter}@example.com`, provider: "google", picture: null, createdAt: "2026-10-01T10:00:00.000Z", lastLoginAt: "2026-10-19T10:00:00.000Z", projectCount: 0, iconCount: 0, activeTokens: 0, isAdmin: false, isSelf: false, ...over };
};
const reply = (users: AdminUser[], total = users.length) => ({ users, total, page: 1, limit: 25 });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(adminApi.getAdminStats).mockResolvedValue({ users: 5, admins: 1, members: 4, googleUsers: 3, microsoftUsers: 1, projects: 7, publicProjects: 3, privateProjects: 4, spriteProjects: 4, fontProjects: 3, draftProjects: 1, icons: 42, fontBuilds: 2, activeTokens: 3 });
  counter = 0;
  auth.currentUser.role = "admin";
  const me = user({ id: "u0", displayName: "Admin", email: "admin@example.com", isAdmin: true, isSelf: true });
  const ada = user({ displayName: "Ada", email: "ada@example.com", projectCount: 2, iconCount: 14, activeTokens: 1 });
  const bob = user({ displayName: "Bob", email: "bob@example.com", lastLoginAt: null });
  listUsers.mockResolvedValue(reply([me, ada, bob]));
});

describe("access", () => {
  it("sends a non-admin to the dashboard without asking the server", () => {
    auth.currentUser.role = "user";
    renderPage();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });
});

describe("the user list", () => {
  it("shows a busy state, then each user with their counts, badges and last sign-in", async () => {
    renderPage();
    expect(screen.getByLabelText("Loading users")).toHaveAttribute("aria-busy", "true");
    const row = (await screen.findByText("ada@example.com")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Ada")).toBeInTheDocument();
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent).slice(2, 5)).toEqual(["2", "14", "1"]);
    const me = screen.getByText("admin@example.com").closest("tr") as HTMLElement;
    expect(within(me).getAllByText("Admin")).toHaveLength(2);
    expect(within(me).getByText("You")).toBeInTheDocument();
    expect(within(screen.getByText("bob@example.com").closest("tr") as HTMLElement).getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("3 users")).toBeInTheDocument();
  });

  it("keeps the table's hidden text inside its scroll box, so a phone does not scroll sideways", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Users" });
    expect(table.parentElement).toHaveClass("relative", "overflow-x-auto");
  });

  it("does not offer to delete yourself", async () => {
    renderPage();
    await screen.findByText("ada@example.com");
    expect(screen.getAllByRole("button", { name: /^Delete / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Delete Ada", "Delete Bob"]);
  });

  it("shows an error with a retry", async () => {
    listUsers.mockRejectedValueOnce(new ApiError("Administrator privileges required.", 403));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Administrator privileges required.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
  });

  it("searches, and says when nothing matches", async () => {
    renderPage();
    await screen.findByText("ada@example.com");
    listUsers.mockResolvedValue(reply([]));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search users" }), "zzz");
    expect(await screen.findByText("No users match “zzz”.")).toBeInTheDocument();
    expect(listUsers).toHaveBeenLastCalledWith({ search: "zzz", page: 1, limit: 25 });
  });

  it("pages through a long list", async () => {
    listUsers.mockResolvedValue(reply([user()], 60));
    renderPage();
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ page: 2, limit: 25 }));
  });
});

describe("deleting a user", () => {
  const open = async (name: string) => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: `Delete ${name}` }));
    return screen.getByRole("dialog");
  };

  it("deletes a user who owns nothing after one confirmation", async () => {
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ deletedProjects: 0, deletedIcons: 0, transferredProjects: 0, revokedTokens: 0 });
    const dialog = await open("Bob");
    expect(within(dialog).getByText("They own no projects.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
    expect(adminApi.deleteUser).toHaveBeenCalledWith("u3", {});
    expect(await screen.findByText("Deleted Bob.")).toBeInTheDocument();
  });

  it("asks what happens to their projects, and hands them over when chosen", async () => {
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ deletedProjects: 0, deletedIcons: 0, transferredProjects: 2, revokedTokens: 1 });
    const dialog = await open("Ada");
    expect(within(dialog).getByText(/They own 2 projects with 14 icons/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move projects and delete user" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose who receives the projects.");
    expect(adminApi.deleteUser).not.toHaveBeenCalled();
    const choices = await within(dialog).findByRole("option", { name: /Bob/ });
    await userEvent.selectOptions(within(dialog).getByLabelText("New owner"), choices);
    await userEvent.click(within(dialog).getByRole("button", { name: "Move projects and delete user" }));
    expect(adminApi.deleteUser).toHaveBeenCalledWith("u2", { transferTo: "u3" });
    expect(await screen.findByText("Deleted Ada. 2 projects moved.")).toBeInTheDocument();
  });

  it("does not offer the user being deleted as the new owner", async () => {
    const dialog = await open("Ada");
    await within(dialog).findByRole("option", { name: /Bob/ });
    expect(within(dialog).queryByRole("option", { name: /Ada/ })).not.toBeInTheDocument();
  });

  it("can delete their projects with them", async () => {
    vi.mocked(adminApi.deleteUser).mockResolvedValue({ deletedProjects: 2, deletedIcons: 14, transferredProjects: 0, revokedTokens: 1 });
    const dialog = await open("Ada");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Delete them with everything/ }));
    expect(within(dialog).queryByLabelText("New owner")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
    expect(adminApi.deleteUser).toHaveBeenCalledWith("u2", {});
    expect(await screen.findByText("Deleted Ada. 2 projects deleted.")).toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when the server refuses", async () => {
    vi.mocked(adminApi.deleteUser).mockRejectedValue(new ApiError("You cannot delete your own account.", 400));
    const dialog = await open("Bob");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You cannot delete your own account.");
  });

  it("can be cancelled", async () => {
    const dialog = await open("Bob");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(adminApi.deleteUser).not.toHaveBeenCalled();
  });
});

describe("moving a project", () => {
  const project = makeDetail({ id: "p1", name: "Feather", owner: { id: "u2", displayName: "Ada" } });
  const setup = (over: { onClose?: () => void; onTransferred?: (p: unknown) => void } = {}) => {
    const props = { onClose: vi.fn(), onTransferred: vi.fn(), ...over };
    render(
      <ToastProvider>
        <TransferProjectDialog open project={project} {...props} />
      </ToastProvider>,
    );
    return props;
  };

  it("moves it to the chosen user and does not list the current owner", async () => {
    vi.mocked(adminApi.transferProject).mockResolvedValue(makeDetail({ id: "p1", name: "Feather" }));
    const props = setup();
    await screen.findByRole("option", { name: /Bob/ });
    expect(screen.queryByRole("option", { name: /Ada/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("New owner"), screen.getByRole("option", { name: /Bob/ }));
    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(adminApi.transferProject).toHaveBeenCalledWith("p1", "u3");
    await waitFor(() => expect(props.onTransferred).toHaveBeenCalled());
    expect(props.onClose).toHaveBeenCalled();
  });

  it("needs a choice, and shows a server refusal", async () => {
    vi.mocked(adminApi.transferProject).mockRejectedValue(new ApiError("That user already owns this project.", 409));
    setup();
    await screen.findByRole("option", { name: /Bob/ });
    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the new owner.");
    await userEvent.selectOptions(screen.getByLabelText("New owner"), screen.getByRole("option", { name: /Bob/ }));
    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(await screen.findByText("That user already owns this project.")).toBeInTheDocument();
  });
});

describe("totals and the link to a user's projects", () => {
  it("has a small breadcrumb back to the dashboard, above a Manage users title", async () => {
    renderPage();
    await screen.findByText("ada@example.com");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("shows only user numbers under the tabs: users, admins, members and the two sign-in kinds", async () => {
    renderPage();
    const totals = await screen.findByRole("region", { name: "User totals" });
    expect(await within(totals).findByText("Google sign-ins")).toBeInTheDocument();
    expect([...totals.querySelectorAll("p.text-xs")].map((p) => p.textContent)).toEqual(["Users", "Admins", "Members", "Google sign-ins", "Microsoft sign-ins"]);
    expect([...totals.querySelectorAll("p.text-xl")].map((p) => p.textContent)).toEqual(["5", "1", "4", "3", "1"]);
    expect(screen.queryByRole("region", { name: "Project totals" })).not.toBeInTheDocument();
  });

  it("filters users by sign-in provider, with counts on the pills", async () => {
    renderPage();
    await screen.findByText("ada@example.com");
    const group = within(screen.getByRole("group", { name: "Sign-in" }));
    expect(await group.findByRole("button", { name: "All 5" })).toBeInTheDocument();
    expect(group.getByRole("button", { name: "Google 3" })).toBeInTheDocument();
    expect(group.getByRole("button", { name: "Microsoft 1" })).toBeInTheDocument();
    await userEvent.click(group.getByRole("button", { name: "Microsoft 1" }));
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ provider: "microsoft", page: 1, limit: 25 }));
    await userEvent.click(group.getByRole("button", { name: "All 5" }));
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ page: 1, limit: 25 }));
  });

  it("links a user who owns projects to their projects, and no link for one who owns none", async () => {
    renderPage();
    await screen.findByText("ada@example.com");
    expect(screen.getByRole("link", { name: "Projects of Ada" })).toHaveAttribute("href", expect.stringMatching(/^\/admin\/projects\?owner=u\d+$/));
    expect(screen.queryByRole("link", { name: "Projects of Bob" })).not.toBeInTheDocument();
  });
});
