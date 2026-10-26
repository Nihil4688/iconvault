// Tests for the dashboard: loading and empty states, filters kept in the address, search, create, edit, duplicate, archive, delete, copy, permissions, and failures.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as foldersApi from "../api/folders";
import * as iconsApi from "../api/icons";
import * as projectsApi from "../api/projects";
import { ApiError } from "../api/http";
import { HeaderActionsContext } from "../context/headerActionsContext";
import { ToastProvider } from "../context/ToastContext";
import { READ_ONLY, makeDetail, makeFolder, makeIcon, makeProject } from "../test/fixtures";
import DashboardPage from "./DashboardPage";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ currentUser: { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com" } }) }));
vi.mock("../api/projects");
vi.mock("../api/icons");
vi.mock("../api/folders");

const listProjects = vi.mocked(projectsApi.listProjects);
const searchIcons = vi.mocked(iconsApi.searchIcons);

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

beforeEach(() => {
  vi.resetAllMocks();
  listProjects.mockResolvedValue(reply([]));
  searchIcons.mockResolvedValue({ icons: [], total: 0, page: 1, limit: 24 });
});

describe("importing a project", () => {
  const zip = () => new File(["zip"], "feather-export.zip", { type: "application/zip" });

  it("creates a project from the chosen ZIP and offers to open it", async () => {
    vi.mocked(projectsApi.importProject).mockResolvedValue({ project: makeDetail({ id: "imp1", name: "Feather" }), imported: 12, foldersCreated: 2, problems: [] });
    renderPage();
    await userEvent.upload(await screen.findByLabelText("Project export file"), zip());
    expect(projectsApi.importProject).toHaveBeenCalledWith(expect.objectContaining({ name: "feather-export.zip" }));
    expect(await screen.findByText("Imported “Feather” with 12 icons.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Project page")).toBeInTheDocument();
  });

  it("warns when some icons could not be imported", async () => {
    vi.mocked(projectsApi.importProject).mockResolvedValue({ project: makeDetail({ id: "imp2", name: "Partial" }), imported: 1, foldersCreated: 0, problems: [{ file: "icons/bad.svg", message: "Not valid" }] });
    renderPage();
    await userEvent.upload(await screen.findByLabelText("Project export file"), zip());
    expect(await screen.findByText(/1 icon could not be imported\./)).toBeInTheDocument();
  });

  it("shows the reason when the file is refused", async () => {
    vi.mocked(projectsApi.importProject).mockRejectedValue(new ApiError("This archive has no project.json, so it is not a project export.", 400));
    renderPage();
    await userEvent.upload(await screen.findByLabelText("Project export file"), zip());
    expect(await screen.findByText(/no project\.json/)).toBeInTheDocument();
  });
});

describe("listing", () => {
  it("shows a loading state, then the project cards", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Feather", description: "Line icons", iconCount: 3, purpose: "font", visibility: "public" })]));
    renderPage();
    expect(screen.getByLabelText("Loading projects")).toHaveAttribute("aria-busy", "true");
    const card = (await screen.findByRole("heading", { name: "Feather" })).closest("li") as HTMLElement;
    expect(within(card).getByText("Line icons")).toBeInTheDocument();
    expect(within(card).getByText("Public")).toBeInTheDocument();
    expect(within(card).getByText("Font")).toBeInTheDocument();
    // The small card leaves out the icon count and the date.
    expect(within(card).queryByText(/3 icons/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Updated/)).not.toBeInTheDocument();
    expect(within(card).getByText("You")).toBeInTheDocument();
    expect(within(card).getByText(/Created by/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Feather" })).toHaveAttribute("href", expect.stringMatching(/^\/projects\/p\d+$/));
  });

  it("keeps the description to one line that is cut off, and the card small, with the sample icons on a row of their own", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Long", description: "A very long description that would otherwise wrap over several lines of the card" })]));
    renderPage();
    const card = (await screen.findByRole("heading", { name: "Long" })).closest("li") as HTMLElement;
    const text = within(card).getByText(/A very long description/);
    expect(text).toHaveClass("truncate");
    expect(text).toHaveAttribute("title", expect.stringContaining("A very long description"));
    expect(card).toHaveClass("p-3.5");
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
  });

  it("names the owner of someone else's project and shows sample icons", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Shared", owner: { id: "u2", displayName: "Grace Hopper" }, access: READ_ONLY, sampleIcons: [{ id: "s1", name: "a", svg: "<svg viewBox='0 0 1 1'><path d='M0 0'/></svg>" }] })]));
    renderPage();
    const card = (await screen.findByRole("heading", { name: "Shared" })).closest("li") as HTMLElement;
    expect(within(card).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(card).getByText(/Created by/)).toBeInTheDocument();
    const samples = within(card).getByRole("img", { name: "1 sample icon" });
    expect(samples).toBeInTheDocument();
    // Not in the same row as the badges.
    expect(samples.parentElement).toBe(card);
  });

  it("shows an empty state that offers to create the first project", async () => {
    renderPage();
    expect(await screen.findByText("You have no projects yet.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "New project" })[1] as HTMLElement);
    expect(screen.getByRole("dialog", { name: "New project" })).toBeInTheDocument();
  });

  it("shows an error with a retry that loads again", async () => {
    listProjects.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    listProjects.mockResolvedValue(reply([makeProject({ name: "Back again" })]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Back again" })).toBeInTheDocument();
  });

  it("mentions when more projects exist than are shown", async () => {
    listProjects.mockResolvedValue({ ...reply([makeProject()]), total: 150 });
    renderPage();
    expect(await screen.findByText(/Showing the first 1 of 150 projects/)).toBeInTheDocument();
  });
});

describe("filters", () => {
  const show = () => within(screen.getByRole("group", { name: "Show" }));
  const types = () => within(screen.getByRole("group", { name: "Type" }));

  it("asks for everything active, newest activity first, by default", async () => {
    renderPage();
    await screen.findByText("You have no projects yet.");
    expect(listProjects).toHaveBeenCalledWith({ scope: "all", status: "active", sort: "updated", limit: 100 });
  });

  it("reads the filters from the address", async () => {
    renderPage("/?scope=public&type=font&status=archived&sort=name");
    await screen.findByText("No projects match.");
    expect(listProjects).toHaveBeenCalledWith({ scope: "all", status: "archived", sort: "name", limit: 100 });
    expect(show().getByRole("button", { name: /^Public/ })).toHaveAttribute("aria-pressed", "true");
    expect(types().getByRole("button", { name: /^Fonts/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Status")).toHaveValue("archived");
    expect(screen.getByLabelText("Sort by")).toHaveValue("name");
  });

  it("ignores values it does not know", async () => {
    renderPage("/?scope=everything&sort=random");
    await screen.findByText("You have no projects yet.");
    expect(listProjects).toHaveBeenCalledWith(expect.objectContaining({ scope: "all", sort: "updated" }));
  });

  it("changing a filter updates the address; going back to the default removes it", async () => {
    renderPage();
    await screen.findByText("You have no projects yet.");
    await userEvent.click(show().getByRole("button", { name: /^Private/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?scope=private");
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "name");
    expect(screen.getByTestId("where")).toHaveTextContent("scope=private&sort=name");
    await userEvent.click(types().getByRole("button", { name: /^Sprites/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("scope=private&sort=name&type=sprite");
    await userEvent.click(show().getByRole("button", { name: /^All/ }));
    await userEvent.click(types().getByRole("button", { name: /^All types/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/?sort=name");
  });

  it("says nothing matches (not 'no projects yet') when filters are on", async () => {
    renderPage("/?scope=private");
    expect(await screen.findByText("No projects match.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
  });

  it("calls the statuses Active, Draft and Both, and sorts from a filter icon", async () => {
    renderPage();
    const status = (await screen.findByLabelText("Status")) as HTMLSelectElement;
    expect([...status.options].map((option) => option.textContent)).toEqual(["Active", "Draft", "Both"]);
    const sort = screen.getByLabelText("Sort by") as HTMLSelectElement;
    expect([...sort.options].map((option) => option.textContent)).toEqual(["Recently updated", "Newest", "Name", "Most icons"]);
    expect(screen.getByTitle("Sort: Recently updated")).toBeInTheDocument();
  });
});

describe("private and public", () => {
  const mix = () =>
    listProjects.mockResolvedValue(
      reply([
        makeProject({ id: "a", name: "Alpha", visibility: "private", purpose: "font" }),
        makeProject({ id: "b", name: "Bravo", visibility: "public", purpose: "sprite" }),
        makeProject({ id: "c", name: "Charlie", visibility: "public", purpose: "font" }),
      ]),
    );

  it("shows counts on the Show and Type pills", async () => {
    mix();
    renderPage();
    await screen.findByRole("heading", { name: "Alpha" });
    const show = within(screen.getByRole("group", { name: "Show" }));
    expect(show.getByRole("button", { name: "All 3" })).toBeInTheDocument();
    expect(show.getByRole("button", { name: "Private 1" })).toBeInTheDocument();
    expect(show.getByRole("button", { name: "Public 2" })).toBeInTheDocument();
    const types = within(screen.getByRole("group", { name: "Type" }));
    expect(types.getByRole("button", { name: "Sprites 1" })).toBeInTheDocument();
    expect(types.getByRole("button", { name: "Fonts 2" })).toBeInTheDocument();
  });

  it("groups the projects under Private and Public when All is chosen", async () => {
    mix();
    renderPage();
    await screen.findByRole("heading", { name: "Alpha" });
    const privateSection = screen.getByRole("region", { name: /Private/ });
    const publicSection = screen.getByRole("region", { name: /Public/ });
    expect(within(privateSection).getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(within(publicSection).getByRole("heading", { name: "Bravo" })).toBeInTheDocument();
    expect(within(publicSection).getByRole("heading", { name: "Charlie" })).toBeInTheDocument();
    expect(within(privateSection).queryByRole("heading", { name: "Bravo" })).not.toBeInTheDocument();
  });

  it("shows only the chosen kind, in one list, without section headings", async () => {
    mix();
    renderPage("/?scope=public");
    await screen.findByRole("heading", { name: "Bravo" });
    expect(screen.queryByRole("heading", { name: "Alpha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Private/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Charlie" })).toBeInTheDocument();
  });

  it("filters by type on top of private and public", async () => {
    mix();
    renderPage("/?type=font");
    await screen.findByRole("heading", { name: "Alpha" });
    expect(screen.queryByRole("heading", { name: "Bravo" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Charlie" })).toBeInTheDocument();
  });

  it("leaves out a section with no projects", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ id: "b", name: "Bravo", visibility: "public" })]));
    renderPage();
    await screen.findByRole("heading", { name: "Bravo" });
    expect(screen.queryByRole("region", { name: /Private/ })).not.toBeInTheDocument();
  });
});

describe("the top bar", () => {
  it("has no visible Projects heading, and puts New project into the top bar when there is one", async () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    render(
      <HeaderActionsContext.Provider value={slot}>
        <MemoryRouter>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </MemoryRouter>
      </HeaderActionsContext.Provider>,
    );
    await screen.findByText("You have no projects yet.");
    expect(within(slot).getByRole("button", { name: "New project" })).toBeInTheDocument();
    expect(within(slot).queryByRole("button", { name: "Import project" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toHaveClass("sr-only");
    slot.remove();
  });
});

describe("search", () => {
  it("searches projects after a short pause and icons from two characters", async () => {
    renderPage();
    await screen.findByText("You have no projects yet.");
    searchIcons.mockResolvedValue({ icons: [{ ...makeIcon({ name: "Arrow Left" }), project: { id: "p9", name: "Feather", prefix: "f", color: "#000000", visibility: "public", purpose: "sprite" } }], total: 1, page: 1, limit: 24 });

    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects and icons" }), "ar");
    await waitFor(() => expect(searchIcons).toHaveBeenCalledWith("ar", { limit: 24 }));
    expect(listProjects).toHaveBeenLastCalledWith(expect.objectContaining({ search: "ar" }));
    expect(await screen.findByRole("heading", { name: "Icons matching “ar”" })).toBeInTheDocument();
    expect(screen.getByText("Arrow Left")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Feather" })).toHaveAttribute("href", "/projects/p9");
    expect(screen.getByRole("status")).toHaveTextContent("1 icon found");
  });

  it("shows each icon's project type badge in the search results", async () => {
    searchIcons.mockResolvedValue({
      icons: [
        { ...makeIcon({ id: "font-icon", name: "Font Icon" }), project: { id: "font-project", name: "Font set", prefix: "font", color: "#000000", visibility: "private", purpose: "font" } },
        { ...makeIcon({ id: "sprite-icon", name: "Sprite Icon" }), project: { id: "sprite-project", name: "Sprite set", prefix: "sprite", color: "#000000", visibility: "public", purpose: "sprite" } },
      ],
      total: 2,
      page: 1,
      limit: 24,
    });
    renderPage();
    await screen.findByText("You have no projects yet.");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects and icons" }), "ar");

    expect(await screen.findByText("Font Icon")).toBeInTheDocument();
    expect(screen.getByText("Font")).toBeInTheDocument();
    expect(screen.getByText("Sprite")).toBeInTheDocument();
  });

  it("does not search icons for a single character", async () => {
    renderPage();
    await screen.findByText("You have no projects yet.");
    await userEvent.type(screen.getByRole("searchbox"), "a");
    await waitFor(() => expect(listProjects).toHaveBeenLastCalledWith(expect.objectContaining({ search: "a" })));
    expect(searchIcons).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /Icons matching/ })).not.toBeInTheDocument();
  });

  it("shows a failed icon search without hiding the projects", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Still here" })]));
    searchIcons.mockRejectedValue(new ApiError("Search is down."));
    renderPage();
    await screen.findByRole("heading", { name: "Still here" });
    await userEvent.type(screen.getByRole("searchbox"), "ar");
    expect(await screen.findByText("Search is down.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still here" })).toBeInTheDocument();
  });
});

describe("creating a project", () => {
  const open = async () => {
    renderPage();
    await screen.findByText("You have no projects yet.");
    await userEvent.click(screen.getAllByRole("button", { name: "New project" })[0] as HTMLElement);
    return screen.getByRole("dialog", { name: "New project" });
  };

  it("validates before sending", async () => {
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(projectsApi.createProject).not.toHaveBeenCalled();
  });

  it("suggests a prefix from the name until the prefix is edited by hand", async () => {
    const dialog = await open();
    const name = within(dialog).getByLabelText("Name");
    const prefix = within(dialog).getByLabelText("Prefix");
    await userEvent.type(name, "Feather Core");
    expect(prefix).toHaveValue("feather-co");
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "fc");
    await userEvent.type(name, " Extra");
    expect(prefix).toHaveValue("fc");
  });

  it("creates the project with the chosen options and offers to open it", async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValue(makeDetail({ id: "new1", name: "Feather" }));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Name"), "  Feather ");
    await userEvent.type(within(dialog).getByLabelText("Description"), "Line icons");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Icon font/ }));
    await userEvent.click(within(dialog).getByRole("radio", { name: /Public/ }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "Emerald" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));

    expect(projectsApi.createProject).toHaveBeenCalledWith({ name: "Feather", description: "Line icons", prefix: "feather", color: "#047857", visibility: "public", purpose: "font" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Created “Feather”.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Project page")).toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server's message when saving fails", async () => {
    vi.mocked(projectsApi.createProject).mockRejectedValue(new ApiError("Invalid input (prefix): use 1-20 letters"));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Feather");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Invalid input (prefix)");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Feather");
  });
});

describe("project actions", () => {
  const mine = () => makeProject({ id: "mine1", name: "Mine", description: "d", prefix: "mn", color: "#7c3aed", visibility: "private", purpose: "font" });
  const menuFor = async (name: string) => {
    await userEvent.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
    return screen.getByRole("menu", { name: `Actions for ${name}` });
  };

  it("offers every action on a project you own", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    renderPage();
    const menu = await menuFor("Mine");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Edit details", "Duplicate", "Mark as draft", "Delete"]);
  });

  it("offers only Duplicate on someone else's public project", async () => {
    listProjects.mockResolvedValue(reply([makeProject({ name: "Theirs", owner: { id: "u2", displayName: "Grace" }, visibility: "public", access: READ_ONLY })]));
    renderPage();
    const menu = await menuFor("Theirs");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Duplicate"]);
  });

  it("edits details, with the type locked, and sends no purpose", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail({ name: "Renamed" }));
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Edit details" }));
    const dialog = screen.getByRole("dialog", { name: "Edit project" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Mine");
    expect(within(dialog).getByLabelText("Prefix")).toHaveValue("mn");
    expect(within(dialog).getByRole("radio", { name: /Icon font/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Icon font/ })).toBeDisabled();
    expect(within(dialog).getByRole("radio", { name: "Purple" })).toBeChecked();

    await userEvent.clear(within(dialog).getByLabelText("Name"));
    await userEvent.type(within(dialog).getByLabelText("Name"), "Renamed");
    expect(within(dialog).getByLabelText("Prefix")).toHaveValue("mn");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("mine1", { name: "Renamed", description: "d", prefix: "mn", color: "#7c3aed", visibility: "private" });
    expect(await screen.findByText("Saved “Renamed”.")).toBeInTheDocument();
  });

  it("duplicates and offers to open the copy", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    vi.mocked(projectsApi.duplicateProject).mockResolvedValue(makeDetail({ id: "copy1", name: "Mine (Copy)" }));
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Duplicate" }));
    expect(projectsApi.duplicateProject).toHaveBeenCalledWith("mine1");
    expect(await screen.findByText("Created “Mine (Copy)”.")).toBeInTheDocument();
  });

  it("marks a project as a draft and back", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail());
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Mark as draft" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("mine1", { isArchived: true });
    expect(await screen.findByText("Marked “Mine” as draft.")).toBeInTheDocument();
  });

  it("offers Unarchive for an archived project and shows an Archived badge", async () => {
    listProjects.mockResolvedValue(reply([{ ...mine(), isArchived: true }]));
    vi.mocked(projectsApi.updateProject).mockResolvedValue(makeDetail());
    renderPage("/?status=archived");
    const card = (await screen.findByRole("heading", { name: "Mine" })).closest("li") as HTMLElement;
    expect(within(card).getByText("Draft")).toBeInTheDocument();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Mark as active" }));
    expect(projectsApi.updateProject).toHaveBeenCalledWith("mine1", { isArchived: false });
  });

  it("asks before deleting and then deletes", async () => {
    listProjects.mockResolvedValue(reply([{ ...mine(), iconCount: 4 }]));
    vi.mocked(projectsApi.deleteProject).mockResolvedValue({ deletedIcons: 4, deletedFolders: 0 });
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Mine”?" });
    expect(dialog).toHaveTextContent("4 icons");
    expect(projectsApi.deleteProject).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
    expect(projectsApi.deleteProject).toHaveBeenCalledWith("mine1");
    expect(await screen.findByText("Deleted “Mine”.")).toBeInTheDocument();
  });

  it("reports a failed action with a message", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    vi.mocked(projectsApi.duplicateProject).mockRejectedValue(new ApiError("Project not found."));
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Duplicate" }));
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
  });

  it("keeps the delete dialog open and shows the error when deleting fails", async () => {
    listProjects.mockResolvedValue(reply([mine()]));
    vi.mocked(projectsApi.deleteProject).mockRejectedValue(new ApiError("You can only manage projects you own."));
    renderPage();
    await userEvent.click(within(await menuFor("Mine")).getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can only manage projects you own.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("copying a found icon", () => {
  async function openCopy() {
    const found = { ...makeIcon({ id: "ic1", projectId: "src1", name: "Arrow Left" }), project: { id: "src1", name: "Feather", prefix: "f", color: "#000000", visibility: "public" as const, purpose: "sprite" as const } };
    searchIcons.mockResolvedValue({ icons: [found], total: 1, page: 1, limit: 24 });
    listProjects.mockImplementation(async (params) =>
      params?.scope === "mine" ? reply([makeProject({ id: "mineA", name: "Mine A" }), makeProject({ id: "ro", name: "Read only", access: READ_ONLY }), makeProject({ id: "mineB", name: "Mine B" })]) : reply([]),
    );
    vi.mocked(foldersApi.listFolders).mockResolvedValue({ folders: [makeFolder({ id: "fa", name: "UI" }), makeFolder({ id: "fb", name: "Arrows", parentId: "fa" })], uncategorizedCount: 0 });
    renderPage();
    await userEvent.type(await screen.findByRole("searchbox"), "arrow");
    await userEvent.click(await screen.findByRole("button", { name: "Copy Arrow Left to a project" }));
    return screen.getByRole("dialog", { name: "Copy to project" });
  }

  it("offers only projects you can edit, with an indented folder list", async () => {
    const dialog = await openCopy();
    const project = await within(dialog).findByLabelText("Project");
    expect(within(project).getAllByRole("option").map((o) => o.textContent)).toEqual(["Mine A", "Mine B"]);
    expect(project).toHaveValue("mineA");
    await waitFor(() => expect(within(dialog).getByLabelText("Folder")).toHaveTextContent("Arrows"));
    expect(within(within(dialog).getByLabelText("Folder")).getAllByRole("option").map((o) => o.textContent?.trim())).toEqual(["Project root", "UI", "Arrows"]);
  });

  it("copies into the chosen project, folder and strategy", async () => {
    vi.mocked(iconsApi.copyIcons).mockResolvedValue({ created: [makeIcon()], replaced: [], skipped: [], errors: [], foldersCreated: 0 });
    const dialog = await openCopy();
    await userEvent.selectOptions(await within(dialog).findByLabelText("Project"), "mineB");
    await waitFor(() => expect(foldersApi.listFolders).toHaveBeenCalledWith("mineB"));
    await userEvent.selectOptions(await within(dialog).findByLabelText("If an icon with that name exists"), "skip");
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy icon" }));
    expect(iconsApi.copyIcons).toHaveBeenCalledWith("mineB", { sourceProjectId: "src1", iconIds: ["ic1"], folderId: null, strategy: "skip" });
    expect(await screen.findByText("Copied to Mine B.")).toBeInTheDocument();
  });

  it("explains when the icon was skipped, and shows a failure inside the dialog", async () => {
    vi.mocked(iconsApi.copyIcons).mockResolvedValueOnce({ created: [], replaced: [], skipped: [{ name: "Arrow Left", reason: "An icon with that name already exists." }], errors: [], foldersCreated: 0 });
    const dialog = await openCopy();
    await within(dialog).findByLabelText("Project");
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy icon" }));
    expect(await screen.findByText("Skipped: An icon with that name already exists.")).toBeInTheDocument();
  });

  it("shows a server failure inside the dialog", async () => {
    vi.mocked(iconsApi.copyIcons).mockRejectedValue(new ApiError("Project not found."));
    const dialog = await openCopy();
    await within(dialog).findByLabelText("Project");
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy icon" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Project not found.");
  });
});
