// Colour theme logic: the saved preference (light, dark or follow the system), how it resolves to light or dark, and how it is applied to the page. index.html runs a small copy of this before first paint; keep the two in sync.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "system", "dark"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

// The saved preference, or "system" when nothing valid is saved or storage is unavailable (private windows, blocked site data).
export function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies for this visit.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

// Sets the class and color-scheme that the stylesheet and the browser (scrollbars, form controls) react to.
export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

// Calls `listener` whenever the operating system switches between light and dark. Returns a function that stops listening.
export function watchSystemTheme(listener: (prefersDark: boolean) => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
