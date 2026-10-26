// Tests for the theme provider and the toggle together: choosing a theme, persistence, following the system, and accessibility of the buttons.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../../context/ThemeProvider";
import { useTheme } from "../../hooks/useTheme";
import { THEME_STORAGE_KEY } from "../../lib/theme";
import { mockMatchMedia } from "../../test/matchMedia";
import ThemeToggle from "./ThemeToggle";

function Resolved() {
  const { resolved, preference } = useTheme();
  return <p data-testid="state">{`${preference}/${resolved}`}</p>;
}

function setup() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
      <Resolved />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

describe("ThemeToggle", () => {
  it("starts on System and follows a light operating system", () => {
    mockMatchMedia(false);
    setup();
    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("starts dark when the operating system is dark", () => {
    mockMatchMedia(true);
    setup();
    expect(screen.getByTestId("state")).toHaveTextContent("system/dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("switches to Dark and Light, applies them and saves the choice", async () => {
    mockMatchMedia(false);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("ignores the operating system once a theme is chosen, but follows it on System", async () => {
    const media = mockMatchMedia(false);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    act(() => media.setDark(true));
    expect(screen.getByTestId("state")).toHaveTextContent("light/light");

    await userEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByTestId("state")).toHaveTextContent("system/dark");
    act(() => media.setDark(false));
    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("restores a saved choice on load", () => {
    mockMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    setup();
    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows a change made in another tab", () => {
    mockMatchMedia(false);
    setup();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });
    expect(screen.getByTestId("state")).toHaveTextContent("dark/dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null }));
    });
    expect(screen.getByTestId("state")).toHaveTextContent("system/light");
  });

  it("is operable by keyboard and labelled for screen readers", async () => {
    mockMatchMedia(false);
    setup();
    expect(screen.getByRole("group", { name: "Color theme" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    screen.getByRole("button", { name: "Light" }).focus();
    await userEvent.keyboard("{Tab}{Tab}{Enter}");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveFocus();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("throws a clear error when used without the provider", () => {
    const quiet = console.error;
    console.error = () => {};
    expect(() => render(<Resolved />)).toThrow(/ThemeProvider/);
    console.error = quiet;
  });
});
