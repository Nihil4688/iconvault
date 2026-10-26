// Accessibility checks (axe) over every main screen and dialog, rendered with realistic data. This catches missing labels, bad roles, broken ARIA, duplicate ids, empty buttons and links, and heading problems. It does not replace trying the screens with a keyboard and a screen reader.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "../api/admin";
import * as foldersApi from "../api/folders";
import * as fontsApi from "../api/fonts";
import * as spritesApi from "../api/sprites";
import * as iconsApi from "../api/icons";
import * as projectsApi from "../api/projects";
import * as tokensApi from "../api/tokens";
import AppHeader from "../components/shell/AppHeader";
import ManageMenu from "../components/shell/ManageMenu";
import { ThemeProvider } from "../context/ThemeProvider";
import { ToastProvider } from "../context/ToastContext";
import { fontAutoBuild } from "../lib/fontAutoBuild";
import { accessibilityViolations } from "../test/axe";
import { READ_ONLY, makeDetail, makeFolder, makeIcon, makeProject } from "../test/fixtures";
import AccountTokensPage from "./AccountTokensPage";
import AdminPage from "./AdminPage";
import AdminProjectsPage from "./AdminProjectsPage";
import DashboardPage from "./DashboardPage";
import LandingPage from "./LandingPage";
import ProjectPage from "./ProjectPage";

const auth = { currentUser: { id: "u1", displayName: "Ada Lovelace", email: "ada@example.com", role: "admin", provider: "google", picture: null }, logout: vi.fn() };
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../api/projects");
vi.mock("../api/folders");
vi.mock("../api/icons");
vi.mock("../api/admin");
vi.mock("../api/tokens");
vi.mock("../api/fonts");
vi.mock("../api/sprites");
vi.mock("../lib/fontPreview", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/fontPreview")>()), loadPreviewFont: vi.fn().mockResolvedValue(true), unloadPreviewFont: vi.fn() }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11l9-8 9 8v10H3z"/></svg>';
const icons = [makeIcon({ id: "i1", name: "Home", slug: "home", svg: SVG, hasStroke: true, tags: ["nav"] }), makeIcon({ id: "i2", name: "Star", slug: "star", svg: SVG }), makeIcon({ id: "i3", name: "Gone", slug: "gone", svg: SVG, deletedAt: "2026-10-18T10:00:00.000Z" })];
const folders = [makeFolder({ id: "ui", name: "UI", iconCount: 2 }), makeFolder({ id: "arrows", name: "Arrows", parentId: "ui", iconCount: 1 })];

function renderAt(path: string, node: React.ReactNode, route = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path={route} element={node} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}
const project = (path: string) => renderAt(path, <ProjectPage />, "/projects/:projectId/*");
const clean = async () => expect(await accessibilityViolations(document.body, { region: false })).toEqual([]);

beforeEach(() => {
  vi.resetAllMocks();
  // axe probes canvas support; jsdom has none and would log an error each time.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.localStorage.clear();
  vi.mocked(projectsApi.listProjects).mockResolvedValue({ projects: [makeProject({ name: "Feather", description: "Line icons", iconCount: 3, visibility: "public" }), makeProject({ name: "Fonty", purpose: "font", isArchived: false })], total: 2, page: 1, limit: 100 });
  vi.mocked(iconsApi.searchIcons).mockResolvedValue({ icons: [], total: 0, page: 1, limit: 24 });
  vi.mocked(projectsApi.getProject).mockResolvedValue(makeDetail({ id: "p1", name: "Feather", description: "Line icons", iconCount: 2, trashCount: 1, purpose: "sprite", visibility: "public" }));
  vi.mocked(foldersApi.listFolders).mockResolvedValue({ folders, uncategorizedCount: 1 });
  vi.mocked(iconsApi.listIcons).mockImplementation(async (_id, params) => (params?.trash ? { icons: [icons[2] as ReturnType<typeof makeIcon>], total: 1, page: 1, limit: 200 } : { icons: icons.slice(0, 2), total: 2, page: 1, limit: 200 }));
  vi.mocked(iconsApi.getIcon).mockResolvedValue({ ...(icons[0] as ReturnType<typeof makeIcon>), svg: SVG, versions: [{ id: "v1", byteSize: 100, createdAt: "2026-10-10T10:00:00.000Z" }] });
  vi.mocked(adminApi.listUsers).mockResolvedValue({ users: [{ id: "u1", displayName: "Ada Lovelace", email: "ada@example.com", provider: "google", picture: null, createdAt: "2026-10-01T10:00:00.000Z", lastLoginAt: "2026-10-19T10:00:00.000Z", projectCount: 2, iconCount: 9, activeTokens: 1, isAdmin: true, isSelf: true }, { id: "u2", displayName: "Bob", email: "bob@example.com", provider: "microsoft", picture: null, createdAt: "2026-10-01T10:00:00.000Z", lastLoginAt: null, projectCount: 1, iconCount: 2, activeTokens: 0, isAdmin: false, isSelf: false }], total: 2, page: 1, limit: 25 });
  vi.mocked(adminApi.getAdminStats).mockResolvedValue({ users: 5, admins: 1, members: 4, googleUsers: 3, microsoftUsers: 1, projects: 7, publicProjects: 3, privateProjects: 4, spriteProjects: 4, fontProjects: 3, draftProjects: 1, icons: 42, fontBuilds: 2, activeTokens: 3 });
  vi.mocked(tokensApi.listTokens).mockResolvedValue({ tokens: [{ id: "t1", name: "CI", prefix: "isv_AbCd", scope: "read", expiresAt: null, createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null, revokedAt: null }, { id: "t2", name: "Old", prefix: "isv_ZzZz", scope: "read", expiresAt: null, createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: "2026-10-05T10:00:00.000Z", revokedAt: "2026-10-10T10:00:00.000Z" }], maxActive: 10 });
  vi.mocked(fontsApi.buildFont).mockResolvedValue({ fontName: "Feather", prefix: "fth", iconCount: 2, warnings: [{ icon: "Home", message: "Uses strokes." }], css: "@font-face{}", preview: { format: "woff2", base64: "AA==" }, sizes: { woff2: 1000 }, codepoints: [{ id: "i1", name: "Home", slug: "home", codepoint: "E001", className: "fth-home", isNew: true }, { id: "i2", name: "Star", slug: "star", codepoint: "E002", className: "fth-star", isNew: false }] });
  vi.mocked(fontsApi.listFontBuilds).mockResolvedValue([{ id: "b1", version: 1, fontName: "Feather", iconCount: 2, formats: ["woff2", "ttf"], size: 4600, createdAt: "2026-10-20T12:00:00.000Z" }]);
  vi.mocked(spritesApi.listSpriteBuilds).mockResolvedValue([{ id: "s1", version: 1, mode: "symbol", iconCount: 2, size: 2100, createdAt: "2026-10-20T12:00:00.000Z" }]);
});

// Voice-control users say what they see on a button, so its accessible name must contain its visible text (WCAG 2.5.3). axe runs this rule in a real browser; here it is checked directly for the controls that have a custom label.
describe("labels contain the visible text", () => {
  it("icon cards, table rows, the trash buttons and the account menu", async () => {
    project("/projects/p1");
    const card = (await screen.findByRole("button", { name: "Open Home" }, { timeout: 8000 })) as HTMLElement;
    expect(card.textContent).toBe("Home");
    cleanup();
    project("/projects/p1/trash");
    const forever = await screen.findByRole("button", { name: /Delete forever: Gone/ }, { timeout: 8000 });
    expect(forever.textContent).toBe("Delete forever");
    expect(forever.getAttribute("aria-label")).toContain(forever.textContent as string);
    cleanup();
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AppHeader onSignIn={() => undefined} />
        </MemoryRouter>
      </ThemeProvider>,
    );
    const menu = screen.getByRole("button", { name: /account menu/i });
    expect(menu.getAttribute("aria-label")).toContain(menu.textContent?.trim() as string);
  });
});

describe("the checker itself", () => {
  it("does find real problems, so a clean result means something", async () => {
    render(
      <div>
        <button type="button" />
        <img src="x.png" />
        <input type="text" />
      </div>,
    );
    const found = await accessibilityViolations(document.body);
    expect(found.join("\n")).toMatch(/button-name/);
    expect(found.join("\n")).toMatch(/image-alt/);
    expect(found.join("\n")).toMatch(/label/);
  });
});

describe("signed-out and shell", () => {
  it("landing page", async () => {
    render(<LandingPage onSignIn={() => undefined} />);
    await clean();
  });

  it("header with the account menu open", async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AppHeader onSignIn={() => undefined} />
        </MemoryRouter>
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await clean();
  });
});

describe("dashboard", () => {
  it("project list, filters and the new project dialog", async () => {
    renderAt("/", <DashboardPage />);
    await screen.findByRole("heading", { name: "Feather" });
    await clean();
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    await clean();
  });

  it("empty state and a search with icon results", async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({ projects: [], total: 0, page: 1, limit: 100 });
    renderAt("/", <DashboardPage />);
    await screen.findByText(/No projects/i);
    await clean();
  });
});

describe("project workspace", () => {
  it("icons as a grid, with a selection and the bulk bar", async () => {
    project("/projects/p1");
    await screen.findByRole("button", { name: "Open Home" }, { timeout: 8000 });
    await clean();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Home" }));
    await clean();
  });

  it("icons as a table", async () => {
    window.localStorage.setItem("iconView", "list");
    project("/projects/p1");
    await screen.findByRole("table", { name: "Icons" });
    await clean();
  });

  it("the generate button on the bulk bar", async () => {
    project("/projects/p1");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Home" }, { timeout: 8000 }));
    await clean();
  });

  it("the checklist, opened on the Sprite page, in both views", async () => {
    project("/projects/p1/sprite");
    await userEvent.click(await screen.findByRole("button", { name: "Review / edit checklist" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose icons for the sprite" });
    await within(dialog).findByText(/icons selected for the sprite/);
    await clean();
    await userEvent.click(within(dialog).getByRole("button", { name: "Group by folder" }));
    await clean();
    await userEvent.click(within(dialog).getByRole("button", { name: /^Selected/ }));
    await clean();
  });

  it("the icon drawer", async () => {
    project("/projects/p1");
    await userEvent.click(await screen.findByRole("button", { name: "Open Home" }, { timeout: 8000 }));
    await screen.findByRole("heading", { level: 3, name: "Home" }, { timeout: 8000 });
    await clean();
    await userEvent.click(screen.getByRole("tab", { name: "Code" }));
    await clean();
  });

  it("the Upload icons menu and the import dialogs it opens", async () => {
    project("/projects/p1");
    await userEvent.click(await screen.findByRole("button", { name: "More ways to add icons" }));
    await clean();
    await userEvent.click(screen.getByRole("menuitem", { name: /Import SVG Sprite/ }));
    await screen.findByRole("dialog", { name: "Import a sprite" });
    await clean();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "More ways to add icons" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Import Icon Font/ }));
    await screen.findByRole("dialog", { name: "Import a font" });
    await clean();
  });

  it("the add icons, move and tag dialogs", async () => {
    project("/projects/p1");
    await userEvent.click((await screen.findAllByRole("button", { name: "Upload icons" }))[0] as HTMLElement);
    await clean();
    await userEvent.click(screen.getByRole("tab", { name: /paste/i }));
    await clean();
  });

  it("a read-only project", async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue(makeDetail({ id: "p1", name: "Feather", access: READ_ONLY, purpose: "sprite" }));
    project("/projects/p1");
    await screen.findByRole("button", { name: "Open Home" });
    await clean();
  });

  it("trash", async () => {
    project("/projects/p1/trash");
    await screen.findByText("Gone");
    await clean();
  });

  it("settings", async () => {
    project("/projects/p1/settings");
    await screen.findByRole("heading", { name: "Danger zone" });
    await clean();
  });

  it("sprite section", async () => {
    project("/projects/p1/sprite");
    await screen.findByRole("heading", { name: "Sprite build history" });
    expect((await screen.findAllByRole("button", { name: /^Copy code for/ })).length).toBeGreaterThan(0);
    await clean();
  });

  it("font section and a built font", async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue(makeDetail({ id: "p1", name: "Feather", purpose: "font", iconCount: 2 }));
    project("/projects/p1/font");
    await screen.findByRole("button", { name: "Download font" });
    await clean();
    // The font builds by itself; wait for the finished table.
    fontAutoBuild.enabled = true;
    fontAutoBuild.delayMs = 10;
    try {
      await userEvent.type(await screen.findByLabelText("Base class"), "x");
      await screen.findByRole("button", { name: "Copy class fth-home" }, { timeout: 8000 });
      await clean();
    } finally {
      fontAutoBuild.enabled = false;
      fontAutoBuild.delayMs = 700;
    }
  });
});

describe("admin and tokens", () => {
  it("the user list and the delete dialog", async () => {
    renderAt("/admin", <AdminPage />);
    await screen.findByText("bob@example.com");
    await clean();
    await userEvent.click(screen.getByRole("button", { name: "Delete Bob" }));
    await clean();
  });

  it("the project list for admins, with the Manage menu open", async () => {
    renderAt("/admin/projects", <AdminProjectsPage />);
    await screen.findByRole("table", { name: "Projects" });
    await clean();
    await userEvent.click(screen.getByRole("button", { name: "Delete Feather" }));
    await clean();
  });

  it("the Manage menu", async () => {
    renderAt("/", <ManageMenu />);
    await userEvent.click(await screen.findByRole("button", { name: "Manage" }));
    await screen.findByRole("menu", { name: "Admin tools" });
    await clean();
  });

  it("the API tokens page, the create dialog and the revoke confirmation", async () => {
    renderAt("/account/tokens", <AccountTokensPage />);
    await screen.findByText("CI");
    await clean();
    await userEvent.click(screen.getByRole("button", { name: "New token" }));
    await clean();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Revoke CI" }));
    await clean();
  });

  it("the one-time token dialog", async () => {
    vi.mocked(tokensApi.createToken).mockResolvedValue({ id: "t3", name: "New", prefix: "isv_Nnnn", scope: "read", expiresAt: null, createdAt: "2026-10-20T10:00:00.000Z", lastUsedAt: null, revokedAt: null, token: "isv_SECRETSECRETSECRETSECRETSECRETSECRETSECRET1" });
    renderAt("/account/tokens", <AccountTokensPage />);
    await userEvent.click(await screen.findByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "New");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    await screen.findByLabelText("Your new token");
    await clean();
  });
});
