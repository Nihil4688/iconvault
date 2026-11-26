// Tests for project groups on the dashboard: related projects ("bolddesk-agent", "bolddesk-customer") show as one group card that opens to its projects, the open group is kept in the address, and grouping can be turned off.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as iconsApi from "../api/icons";
import * as projectsApi from "../api/projects";
import { ToastProvider } from "../context/ToastContext";
import { accessibilityViolations } from "../test/axe";
import { SVG_A, makeProject } from "../test/fixtures";
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
      makeProject({ id: "a", name: "bolddesk-agent", iconCount: 3, sampleIcons: [icon("i1"), icon("i2")] }),
      makeProject({ id: "c", name: "bolddesk-customer", iconCount: 2, sampleIcons: [icon("i3")] }),
      makeProject({ id: "e", name: "bolddesk-email-template", iconCount: 0 }),
      makeProject({ id: "f", name: "Feather" }),
      makeProject({ id: "p", name: "boldsign-web", visibility: "public" }),
    ]),
  );
  vi.mocked(iconsApi.searchIcons).mockResolvedValue({ icons: [], total: 0, page: 1, limit: 24 });
});

describe("project groups", () => {
  it("shows related projects as one group card with its members and totals", async () => {
    renderPage();
    const card = (await screen.findByRole("heading", { name: "bolddesk" })).closest("li") as HTMLElement;
    expect(within(card).getByText("Group")).toBeInTheDocument();
    expect(within(card).getByText("agent, customer, email-template")).toBeInTheDocument();
    expect(within(card).getByText("3 projects")).toBeInTheDocument();
    expect(within(card).getByText(/5 icons/)).toBeInTheDocument();
    expect(within(card).getByText("+2 more")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "bolddesk-agent" })).not.toBeInTheDocument();
    // A project without relatives stays a normal card, as does a family of one.
    expect(screen.getByRole("heading", { name: "Feather" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "boldsign-web" })).toBeInTheDocument();
    // The section count still counts projects.
    expect(within(screen.getByRole("region", { name: /Private/ })).getByText("4")).toBeInTheDocument();
  });

  it("opens a group into its projects, keeps it in the address, and goes back to all projects", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: "bolddesk" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?group=bolddesk");
    const crumb = screen.getByRole("navigation", { name: "Project Group" });
    expect(within(crumb).getByText("bolddesk")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "bolddesk-agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "bolddesk-email-template" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Feather" })).not.toBeInTheDocument();
    // The pill counts describe the open group.
    expect(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "All 3" })).toBeInTheDocument();
    // Project actions still work inside a group.
    expect(screen.getByRole("button", { name: "Actions for bolddesk-agent" })).toBeInTheDocument();

    await userEvent.click(within(crumb).getByRole("link", { name: "All Projects" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(await screen.findByRole("heading", { name: "bolddesk" })).toBeInTheDocument();
  });

  it("keeps the other filters when opening a group", async () => {
    renderPage("/?type=sprite");
    await userEvent.click(await screen.findByRole("link", { name: "bolddesk" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?type=sprite&group=bolddesk");
  });

  it("shows every project, without groups, when grouping is turned off, and remembers it in the address", async () => {
    renderPage();
    const toggle = await screen.findByRole("button", { name: "Group Related Projects" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("where")).toHaveTextContent("/?grouping=off");
    expect(screen.queryByRole("heading", { name: "bolddesk" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "bolddesk-agent" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(screen.getByRole("heading", { name: "bolddesk" })).toBeInTheDocument();
  });

  it("shows each found project on its own while searching", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "bolddesk" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search Projects and Icons" }), "bolddesk");
    // The highlight splits the name, so the cards are found by their title.
    expect(await screen.findByTitle("bolddesk-agent", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTitle("bolddesk-customer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bolddesk" })).not.toBeInTheDocument();
  });

  it("counts the projects inside hidden groups on the show-more button", async () => {
    window.innerWidth = 375;
    listProjects.mockResolvedValue(
      reply([
        ...["a", "b", "c", "d"].map((letter) => makeProject({ id: letter, name: `Single ${letter}`, visibility: "private" })),
        ...["one", "two", "three"].map((part) => makeProject({ id: part, name: `bolddesk-${part}`, visibility: "private" })),
      ]),
    );
    renderPage();
    const section = await screen.findByRole("region", { name: /Private/ });
    // Four tiles fit in two rows on a narrow screen; the hidden group holds three projects.
    expect(within(section).getByRole("button", { name: "Show 3 More projects" })).toBeInTheDocument();
  });

  it("has no accessibility problems with a group card and inside a group", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "bolddesk" });
    expect(await accessibilityViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("link", { name: "bolddesk" }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
