// Tests for the project workspace page: loading and failures, the header and section links, the read-only note, folder selection kept in the address, folder actions, dropping icons, and the small-screen folder toggle.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as foldersApi from "../api/folders";
import { ApiError } from "../api/http";
import * as iconsApi from "../api/icons";
import * as projectsApi from "../api/projects";
import { ToastProvider } from "../context/ToastContext";
import { READ_ONLY, makeDetail, makeFolder } from "../test/fixtures";
import ProjectPage from "./ProjectPage";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ currentUser: { id: "u1", displayName: "Ada", email: "ada@example.com", role: "user" } }) }));
vi.mock("../api/projects");
vi.mock("../api/folders");
vi.mock("../api/icons");

const getProject = vi.mocked(projectsApi.getProject);
const listFolders = vi.mocked(foldersApi.listFolders);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(path = "/projects/p1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/projects/:projectId/*" element={<ProjectPage />} />
        </Routes>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const ui = makeFolder({ id: "ui", name: "UI", iconCount: 2 });
const arrows = makeFolder({ id: "arrows", name: "Arrows", parentId: "ui", iconCount: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  getProject.mockResolvedValue(makeDetail({ id: "p1", name: "Feather", description: "Line icons", iconCount: 7, trashCount: 2, purpose: "font", visibility: "public", owner: { id: "u1", displayName: "Ada Lovelace" } }));
  listFolders.mockResolvedValue({ folders: [ui, arrows], uncategorizedCount: 4 });
  vi.mocked(iconsApi.listIcons).mockResolvedValue({ icons: [], total: 0, page: 1, limit: 200 });
});

describe("loading and failure", () => {
  it("shows a loading state first", () => {
    renderPage();
    expect(screen.getByRole("status", { name: "Loading project" })).toHaveAttribute("aria-busy", "true");
  });

  it("explains a project that does not exist, with a way back", async () => {
    getProject.mockRejectedValue(new ApiError("Project not found.", 404));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers a retry for other failures", async () => {
    getProject.mockRejectedValueOnce(new ApiError("Could not reach the server."));
    renderPage();
    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Feather" })).toBeInTheDocument();
  });
});

describe("sprite or font section", () => {
  const sprite = () => getProject.mockResolvedValue(makeDetail({ id: "p1", name: "Feather", purpose: "sprite" }));

  it("a sprite project has a Sprite section and no Font section", async () => {
    sprite();
    renderPage();
    expect(await screen.findByRole("link", { name: "Sprite Builder" })).toHaveAttribute("href", "/projects/p1/sprite");
    expect(screen.queryByRole("link", { name: "Font Builder" })).not.toBeInTheDocument();
  });

  it("sends a sprite project away from /font, and a font project away from /sprite", async () => {
    sprite();
    const first = renderPage("/projects/p1/font");
    await screen.findByRole("heading", { level: 1, name: "Feather" });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1"));
    first.unmount();

    getProject.mockResolvedValue(makeDetail({ id: "p1", name: "Feather", purpose: "font" }));
    renderPage("/projects/p1/sprite");
    await screen.findByRole("heading", { level: 1, name: "Feather" });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/projects/p1"));
  });
});

describe("moving from one project to another", () => {
  it("never lets the previous project decide what the next one shows", async () => {
    const detail = (id: string, purpose: "sprite" | "font") => makeDetail({ id, name: id === "p1" ? "First" : "Second", purpose });
    let release: (() => void) | undefined;
    getProject.mockImplementation((id: string) => (id === "p1" ? Promise.resolve(detail("p1", "sprite")) : new Promise((resolve) => { release = () => resolve(detail("p2", "font")); })));
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <ToastProvider>
          <Link to="/projects/p2/font">Go to the second</Link>
          <Routes>
            <Route path="/projects/:projectId/*" element={<ProjectPage />} />
          </Routes>
          <Where />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "First" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Go to the second" }));
    // While the second project loads, nothing of the first is shown and no redirect happens.
    expect(await screen.findByRole("status", { name: "Loading project" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "First" })).not.toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("/projects/p2/font");
    release?.();
    expect(await screen.findByRole("heading", { level: 1, name: "Second" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Download font" })).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("/projects/p2/font");
  });
});

describe("header", () => {
  it("shows the project, its badges and owner, and links to each section with counts", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Feather" })).toBeInTheDocument();
    // The prefix and the description are not shown in the project bar area.
    expect(screen.queryByText("Line icons")).not.toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Icon Font Project")).toBeInTheDocument();
    expect(screen.queryByText(/^Prefix:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Font Builder" })).toHaveAttribute("href", "/projects/p1/font");
    expect(screen.queryByRole("link", { name: "Sprite Builder" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Feather")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Project sections" });
    expect(within(nav).getByRole("link", { name: /Icons/ })).toHaveTextContent("7");
    // The Trash tab shows its label alongside the icon and has no count.
    expect(within(nav).getByText("Trash")).not.toHaveClass("sr-only");
    expect(within(nav).getByRole("link", { name: "Project Settings" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Icons/ })).toHaveAttribute("aria-current", "page");
  });

  it("says the project is read-only when the user cannot edit it", async () => {
    getProject.mockResolvedValue(makeDetail({ id: "p1", access: READ_ONLY, owner: { id: "u2", displayName: "Grace" } }));
    renderPage();
    expect(await screen.findByRole("note")).toHaveTextContent(/only its owner can change it/i);
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
  });

  it("shows no read-only note to someone who can edit", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New folder" })).toBeInTheDocument();
  });

  it("marks a draft project", async () => {
    getProject.mockResolvedValue(makeDetail({ id: "p1", isArchived: true }));
    renderPage();
    expect(await screen.findByText("Draft")).toBeInTheDocument();
  });
});

describe("sections", () => {
  it("lets the folder sidebar fill the remaining viewport height", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });

    const main = screen.getByRole("main");
    const folderSidebar = screen.getByRole("complementary", { name: "Folders" });

    expect(main).toHaveClass("flex", "min-h-screen", "flex-col");
    expect(folderSidebar.parentElement).toHaveClass("flex-1");
    expect(folderSidebar.parentElement?.parentElement).toHaveClass("flex", "flex-1", "flex-col");
  });

  it("shows the folder tree with the Icons section, and hides it on Trash and Settings", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^UI/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: /Trash/ }));
    expect(await screen.findByText("The trash is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Folders" })).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p1/trash");

    await userEvent.click(screen.getByRole("link", { name: "Project Settings" }));
    expect(await screen.findByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
  });

  it("sends an unknown section back to the icons", async () => {
    renderPage("/projects/p1/nonsense");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/projects\/p1$/));
    expect(await screen.findByText("No icons yet.")).toBeInTheDocument();
  });
});

describe("folder selection", () => {
  it("keeps the selected folder in the address and marks it", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^All icons/ })).toHaveAttribute("aria-current", "true");

    await userEvent.click(screen.getByRole("button", { name: /^Arrows/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/projects/p1?folder=arrows");
    expect(screen.getByRole("button", { name: /^Arrows/ })).toHaveAttribute("aria-current", "true");

    await userEvent.click(screen.getByRole("button", { name: /^Uncategorized/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("?folder=root");

    await userEvent.click(screen.getByRole("button", { name: /^All icons/ }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/projects\/p1$/);
  });

  it("opens on the folder named in the address, and falls back to all icons for an unknown one", async () => {
    const { unmount } = renderPage("/projects/p1?folder=ui");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^UI/ })).toHaveAttribute("aria-current", "true");
    unmount();

    renderPage("/projects/p1?folder=gone");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^All icons/ })).toHaveAttribute("aria-current", "true");
  });

  it("uses the project's icon count for All icons and the folder list's count for Uncategorized", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /^All icons/ })).toHaveTextContent("7");
    expect(screen.getByRole("button", { name: /^Uncategorized/ })).toHaveTextContent("4");
  });

  it("has a folder toggle for small screens that names the current folder", async () => {
    renderPage("/projects/p1?folder=arrows");
    await screen.findByRole("heading", { level: 1 });
    const toggle = screen.getByRole("button", { name: /Folder: UI \/ Arrows/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("folder-panel")).toHaveClass("hidden");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("folder-panel")).toHaveClass("block");
  });
});

describe("folder actions", () => {
  it("creates a folder, reloads the list and says so", async () => {
    vi.mocked(foldersApi.createFolder).mockResolvedValue({ id: "n1", projectId: "p1", parentId: null, name: "Logos", orderIndex: 2 });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("Folder name"), "Logos");
    await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
    expect(foldersApi.createFolder).toHaveBeenCalledWith("p1", { name: "Logos", parentId: null });
    expect(await screen.findByText("Created folder “Logos”.")).toBeInTheDocument();
    await waitFor(() => expect(listFolders).toHaveBeenCalledTimes(2));
  });

  it("deletes the selected folder, goes back to all icons, and reports how many icons moved", async () => {
    vi.mocked(foldersApi.deleteFolder).mockResolvedValue({ deletedFolders: 2, movedIcons: 3 });
    renderPage("/projects/p1?folder=ui");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder UI" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(foldersApi.deleteFolder).toHaveBeenCalledWith("ui");
    expect(await screen.findByText("Deleted “UI”. 3 icons moved to Uncategorized.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/projects\/p1$/));
    await waitFor(() => expect(getProject).toHaveBeenCalledTimes(2));
  });

  it("shows a failed rename inside its dialog", async () => {
    vi.mocked(foldersApi.renameFolder).mockRejectedValue(new ApiError('A folder named "Arrows" already exists here.', 409));
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Actions for folder UI" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText('A folder named "Arrows" already exists here.')).toBeInTheDocument();
  });
});

describe("dropping icons on a folder", () => {
  const drop = (name: RegExp, ids: string[]) => {
    const row = screen.getByRole("button", { name }).parentElement as HTMLElement;
    const dataTransfer = { types: ["application/x-svg-icon-ids"], getData: () => JSON.stringify(ids), dropEffect: "" };
    return import("@testing-library/react").then(({ fireEvent }) => fireEvent.drop(row, { dataTransfer }));
  };

  it("moves them and says how many", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockResolvedValue({ requested: 2, matched: 2 });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await drop(/^UI/, ["a", "b"]);
    expect(iconsApi.batchMoveIcons).toHaveBeenCalledWith("p1", ["a", "b"], "ui");
    expect(await screen.findByText("Moved 2 icons.")).toBeInTheDocument();
  });

  it("reports a failure", async () => {
    vi.mocked(iconsApi.batchMoveIcons).mockRejectedValue(new ApiError("You can only change projects you own.", 403));
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    await drop(/^Uncategorized/, ["a"]);
    expect(iconsApi.batchMoveIcons).toHaveBeenCalledWith("p1", ["a"], null);
    expect(await screen.findByText("You can only change projects you own.")).toBeInTheDocument();
  });
});

describe("the project name in the bar", () => {
  it("is 16px, cut off with an ellipsis when long, and never pushes the badges onto another row", async () => {
    getProject.mockResolvedValue(makeDetail({ id: "p1", name: "A very long project name that goes on and on and on (Copy)", purpose: "sprite", visibility: "private" }));
    renderPage();
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveClass("truncate", "min-w-0", "text-base");
    expect(heading).toHaveAttribute("title", "A very long project name that goes on and on and on (Copy)");
    const badges = screen.getByText("Private").closest("div") as HTMLElement;
    expect(badges).toHaveClass("shrink-0", "flex-nowrap");
    expect(heading.parentElement).not.toHaveClass("flex-wrap");
  });
});
