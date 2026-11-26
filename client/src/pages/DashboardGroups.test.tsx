// Tests for project groups on the dashboard: projects put in the same group by hand show as one group card that opens to its projects, Move to Group puts a project in a group or takes it out, the open group is kept in the address, and grouping can be turned off. Similar names alone never group projects.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as iconsApi from "../api/icons";
import * as projectsApi from "../api/projects";
import { ToastProvider } from "../context/ToastContext";
import { accessibilityViolations } from "../test/axe";
import { READ_ONLY, SVG_A, makeDetail, makeProject } from "../test/fixtures";
import DashboardPage from "./DashboardPage";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ currentUser: { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com" } }) }));
vi.mock("../api/projects");
vi.mock("../api/icons");
vi.mock("../api/folders");

const listProjects = vi.mocked(projectsApi.listProjects);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:id" element={<p>Project page</p>} />
        </Routes>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const reply = (projects: ReturnType<typeof makeProject>[]) => ({ projects, total: projects.length, page: 1, limit: 100 });
const icon = (id: string) => ({ id, name: id, svg: SVG_A });

beforeEach(() => {
  vi.resetAllMocks();
  window.innerWidth = 1280;
  listProjects.mockResolvedValue(
    reply([
      makeProject({ id: "a", name: "bolddesk-agent", group: "BoldDesk", iconCount: 3, sampleIcons: [icon("i1"), icon("i2")] }),
      makeProject({ id: "c", name: "bolddesk-customer", group: "BoldDesk", iconCount: 2, sampleIcons: [icon("i3")] }),
      makeProject({ id: "e", name: "bolddesk-email-template", group: "bolddesk", iconCount: 0 }),
      makeProject({ id: "f", name: "Feather" }),
      // Similar names, but never put in a group: they stay separate cards.
      makeProject({ id: "s1", name: "boldsign-web" }),
      makeProject({ id: "s2", name: "boldsign-mobile" }),
      makeProject({ id: "p", name: "Syncfusion Web", group: "Syncfusion", visibility: "public" }),
    ]),
  );
  vi.mocked(iconsApi.searchIcons).mockResolvedValue({ icons: [], total: 0, page: 1, limit: 24 });
});

describe("project groups", () => {
  it("shows the projects put in a group as one group card with its members and totals", async () => {
    renderPage();
    const card = (await screen.findByRole("heading", { name: "BoldDesk" })).closest("li") as HTMLElement;
    expect(within(card).getByText("Group")).toBeInTheDocument();
    expect(within(card).getByText("agent, customer, email-template")).toBeInTheDocument();
    expect(within(card).getByText("3 projects")).toBeInTheDocument();
    expect(within(card).getByText(/5 icons/)).toBeInTheDocument();
    expect(within(card).getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "bolddesk-agent" })).not.toBeInTheDocument();
    // Projects in no group stay normal cards, even when their names look related.
    expect(screen.getByRole("heading", { name: "Feather" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "boldsign-web" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "boldsign-mobile" })).toBeInTheDocument();
    // A group chosen by hand shows even with one project.
    expect(within(screen.getByRole("region", { name: /Public/ })).getByRole("heading", { name: "Syncfusion" })).toBeInTheDocument();
    // The section count still counts projects.
    expect(within(screen.getByRole("region", { name: /Private/ })).getByText("6")).toBeInTheDocument();
  });

  it("opens a group into its projects, keeps it in the address, and goes back to all projects", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: "BoldDesk" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?group=bolddesk");
    const crumb = screen.getByRole("navigation", { name: "Project Group" });
    expect(within(crumb).getByText("BoldDesk")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "bolddesk-agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "bolddesk-email-template" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Feather" })).not.toBeInTheDocument();
    // The pill counts describe the open group.
    expect(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "All 3" })).toBeInTheDocument();
    // Project actions still work inside a group.
    expect(screen.getByRole("button", { name: "Actions for bolddesk-agent" })).toBeInTheDocument();

    await userEvent.click(within(crumb).getByRole("link", { name: "All Projects" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(await screen.findByRole("heading", { name: "BoldDesk" })).toBeInTheDocument();
  });

  it("keeps the other filters when opening a group", async () => {
    renderPage("/?type=sprite");
    await userEvent.click(await screen.findByRole("link", { name: "BoldDesk" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?type=sprite&group=bolddesk");
  });

  it("shows every project, without groups, when grouping is turned off, and remembers it in the address", async () => {
    renderPage();
    const toggle = await screen.findByRole("button", { name: "Show Project Groups" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("where")).toHaveTextContent("/?grouping=off");
    expect(screen.queryByRole("heading", { name: "BoldDesk" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "bolddesk-agent" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(screen.getByRole("heading", { name: "BoldDesk" })).toBeInTheDocument();
  });

  it("shows each found project on its own while searching", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "BoldDesk" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search Projects and Icons" }), "bolddesk");
    // The highlight splits the name, so the cards are found by their title.
    expect(await screen.findByTitle("bolddesk-agent", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTitle("bolddesk-customer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "BoldDesk" })).not.toBeInTheDocument();
  });

  it("counts the projects inside hidden groups on the show-more button", async () => {
    window.innerWidth = 375;
    listProjects.mockResolvedValue(
      reply([
        ...["a", "b", "c", "d"].map((letter) => makeProject({ id: letter, name: `Single ${letter}`, visibility: "private" })),
        ...["one", "two", "three"].map((part) => makeProject({ id: part, name: `bolddesk-${part}`, group: "BoldDesk", visibility: "private" })),
      ]),
    );
    renderPage();
    const section = await screen.findByRole("region", { name: /Private/ });
    // Four tiles fit in two rows on a narrow screen; the hidden group holds three projects.
    expect(within(section).getByRole("button", { name: "Show 3 More projects" })).toBeInTheDocument();
  });

  it("has no accessibility problems with a group card and inside a group", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "BoldDesk" });
    expect(await accessibilityViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("link", { name: "BoldDesk" }));
    expect(await accessibilityViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Actions for bolddesk-agent" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change Group" }));
    expect(await accessibilityViolations(screen.getByRole("dialog", { name: "Change Group" }))).toEqual([]);
  });

  it("offers Move to Group on your own projects only, and Change Group once a project is in one", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Mine" }), makeProject({ name: "Grouped", group: "BoldDesk" }), makeProject({ name: "Theirs", visibility: "public", access: READ_ONLY, owner: { id: "u2", displayName: "Grace" } })]));
    renderPage("/?grouping=off");
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Mine" }));
    expect(screen.getByRole("menuitem", { name: "Move to Group" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Grouped" }));
    expect(screen.getByRole("menuitem", { name: "Change Group" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Actions for Theirs" }));
    expect(screen.queryByRole("menuitem", { name: /Group/ })).not.toBeInTheDocument();
  });

  it("moves a project into an existing group picked from the suggestions", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ id: "f", name: "Feather", group: "BoldDesk" }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Feather" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Group" }));
    const dialog = screen.getByRole("dialog", { name: "Move to Group" });
    // Each group in use is offered once, spelled as its first project spells it.
    const suggestions = within(within(dialog).getByRole("group", { name: "Existing Groups" })).getAllByRole("button");
    expect(suggestions.map((button) => button.textContent)).toEqual(["BoldDesk", "Syncfusion"]);
    await userEvent.click(suggestions[0] as HTMLElement);
    expect(within(dialog).getByLabelText(/Group Name/)).toHaveValue("BoldDesk");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("f", { group: "BoldDesk" });
    expect(await screen.findByText("Moved “Feather” to “BoldDesk”.")).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it("creates a new group from a typed name and joins an existing one whatever its case", async () => {
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ name: "boldsign-web", group: "BoldSign" }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Actions for boldsign-web" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Group" }));
    const dialog = screen.getByRole("dialog", { name: "Move to Group" });
    const field = within(dialog).getByLabelText(/Group Name/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(within(dialog).getByText("Enter a group name.")).toBeInTheDocument();
    expect(projectsApi.updateProject).not.toHaveBeenCalled();
    await userEvent.type(field, "  BoldSign  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(projectsApi.updateProject).toHaveBeenLastCalledWith("s1", { group: "BoldSign" });

    await screen.findByText("Moved “boldsign-web” to “BoldSign”.");
    await userEvent.click(screen.getByRole("button", { name: "Actions for boldsign-mobile" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Group" }));
    await userEvent.type(within(screen.getByRole("dialog", { name: "Move to Group" })).getByLabelText(/Group Name/), "SYNCFUSION");
    await userEvent.click(within(screen.getByRole("dialog", { name: "Move to Group" })).getByRole("button", { name: "Move" }));
    expect(projectsApi.updateProject).toHaveBeenLastCalledWith("s2", { group: "Syncfusion" });
  });

  it("removes a project from its group inside the open group, and shows a failure inside the dialog", async () => {
    const update = vi.mocked(projectsApi.updateProject);
    update.mockRejectedValueOnce(new Error("Could not reach the server."));
    update.mockResolvedValueOnce(makeDetail({ id: "a", name: "bolddesk-agent", group: "" }));
    renderPage("/?group=bolddesk");
    await userEvent.click(await screen.findByRole("button", { name: "Actions for bolddesk-agent" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change Group" }));
    const dialog = screen.getByRole("dialog", { name: "Change Group" });
    expect(within(dialog).getByLabelText(/Group Name/)).toHaveValue("BoldDesk");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from Group" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove from Group" }));
    expect(update).toHaveBeenLastCalledWith("a", { group: "" });
    expect(await screen.findByText("Removed “bolddesk-agent” from its group.")).toBeInTheDocument();
  });
});
