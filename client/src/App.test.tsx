// Tests for the app shell: loading state, the signed-out landing page, the sign-in dialog, the signed-in workspace, the user menu, and basic accessibility (landmarks, skip link, keyboard).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ThemeProvider } from "./context/ThemeProvider";
import { ToastProvider } from "./context/ToastContext";
import type { CurrentUser } from "./context/AuthContext";
import { reloadPage } from "./lib/navigation";
import { mockMatchMedia } from "./test/matchMedia";

type MockAuth = {
  currentUser: CurrentUser | null;
  initializing: boolean;
  loginWithGoogle: ReturnType<typeof vi.fn>;
  loginWithMicrosoft: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

const auth: MockAuth = {
  currentUser: null,
  initializing: false,
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
  logout: vi.fn(),
};

vi.mock("./context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("./pages/DashboardPage", () => ({ default: () => <main id="main"><h1>Your projects</h1></main> }));
vi.mock("./pages/AdminPage", () => ({ default: () => <main id="main"><h1>Administration screen</h1></main> }));
vi.mock("./pages/AccountTokensPage", () => ({ default: () => <main id="main"><h1>API tokens screen</h1></main> }));
vi.mock("./pages/ProjectPage", () => ({ default: () => <main id="main"><h1>Project workspace</h1></main> }));
vi.mock("./lib/navigation", () => ({ reloadPage: vi.fn() }));

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  picture: null,
  emailVerified: true,
  provider: "google",
  role: "user",
  ...over,
});

function renderApp(path = "/") {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockMatchMedia(false);
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.className = "";
  auth.currentUser = null;
  auth.initializing = false;
  auth.loginWithGoogle = vi.fn();
  auth.loginWithMicrosoft = vi.fn();
  auth.logout = vi.fn().mockResolvedValue(undefined);
  vi.mocked(reloadPage).mockClear();
});

describe("while loading", () => {
  it("shows a status message and nothing else", () => {
    auth.initializing = true;
    renderApp();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});

describe("signed out", () => {
  it("shows the landing page, not the compiler", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/organized and compiled into sprites/i);
  });

  it("has landmarks, a skip link that points at the main content, and a header theme switch", () => {
    renderApp();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main");
    expect(within(screen.getByRole("banner")).getByRole("group", { name: "Color theme" })).toBeInTheDocument();
  });

  it("describes the features as a list", () => {
    renderApp();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(screen.getByRole("heading", { name: /organize in projects and folders/i })).toBeInTheDocument();
  });

  it("opens the sign-in dialog from the landing page button and from the header, and closes it again", async () => {
    renderApp();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /sign in to get started/i }));
    const dialog = screen.getByRole("dialog", { name: /library login/i });
    expect(within(dialog).getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /sign in with microsoft/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(/guest/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a sign-in failure as an alert", async () => {
    auth.loginWithGoogle = vi.fn().mockRejectedValue(new Error("Google sign-in is not configured."));
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /sign in to get started/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Google sign-in is not configured.");
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("confirms a successful sign-in", async () => {
    auth.loginWithMicrosoft = vi.fn().mockResolvedValue(user({ provider: "microsoft" }));
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /sign in to get started/i }));
    await userEvent.click(screen.getByRole("button", { name: /sign in with microsoft/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Signed in as ada@example.com (Microsoft)");
  });

  it("switches the theme from the header", async () => {
    renderApp();
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
  });
});

describe("signed in", () => {
  beforeEach(() => {
    auth.currentUser = user();
  });

  it("shows the dashboard, not the landing page or the classic compiler", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Your projects" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main");
  });

  it("opens a project workspace at /projects/:id", () => {
    renderApp("/projects/p1/trash");
    expect(screen.getByRole("heading", { level: 1, name: "Project workspace" })).toBeInTheDocument();
  });

  it("sends unknown addresses to the dashboard", () => {
    renderApp("/nope/at/all");
    expect(screen.getByRole("heading", { level: 1, name: "Your projects" })).toBeInTheDocument();
  });

  it("has no link to the retired classic compiler, and its address goes to the dashboard", () => {
    renderApp("/classic");
    expect(screen.getByRole("heading", { level: 1, name: "Your projects" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Classic compiler" })).not.toBeInTheDocument();
  });

  it("links to API tokens for everyone and to Manage users only for admins", async () => {
    const { unmount } = renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: "API tokens" })).toHaveAttribute("href", "/account/tokens");
    expect(within(menu).queryByRole("menuitem", { name: "Manage users" })).not.toBeInTheDocument();
    unmount();

    auth.currentUser = user({ role: "admin" });
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("menuitem", { name: "Manage users" })).toHaveAttribute("href", "/admin");
  });

  it("opens the token and admin screens from the menu and closes the menu", async () => {
    auth.currentUser = user({ role: "admin" });
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "API tokens" }));
    expect(screen.getByRole("heading", { level: 1, name: "API tokens screen" })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Manage users" }));
    expect(screen.getByRole("heading", { level: 1, name: "Administration screen" })).toBeInTheDocument();
  });

  it("shows the user in the header, with a role badge only for admins", async () => {
    const { unmount } = renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu for ada lovelace/i }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(menu).getByText("Signed in with Google")).toBeInTheDocument();
    expect(within(menu).queryByText("Admin")).not.toBeInTheDocument();
    unmount();

    auth.currentUser = user({ role: "admin", provider: "microsoft" });
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Signed in with Microsoft")).toBeInTheDocument();
  });

  it("shows initials when there is no picture and the picture when there is", () => {
    const { unmount } = renderApp();
    // Initials are drawn by CSS from data-initials, so they are not text on the page.
    expect(document.querySelector("[data-initials='AL']")).not.toBeNull();
    unmount();
    auth.currentUser = user({ picture: "https://example.com/ada.png" });
    const { container } = renderApp();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/ada.png");
    expect(img).toHaveAttribute("alt", "");
    expect(document.querySelector("[data-initials]")).toBeNull();
  });

  it("opens the menu with focus on Sign out, and Escape closes it and returns focus to the button", async () => {
    renderApp();
    const trigger = screen.getByRole("button", { name: /account menu/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the menu on a click outside and when focus leaves it", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out and reloads the page", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it("greets the user once after signing in", async () => {
    window.sessionStorage.setItem("pendingLoginToast", "Ada Lovelace");
    renderApp();
    expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("pendingLoginToast")).toBeNull();
  });
});
