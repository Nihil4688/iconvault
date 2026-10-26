// Tests for the theme logic: reading and saving the preference, resolving it, applying it, and following the system.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "../test/matchMedia";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  watchSystemTheme,
} from "./theme";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preference", () => {
  it("recognises only light, dark and system", () => {
    for (const ok of ["light", "dark", "system"]) expect(isThemePreference(ok)).toBe(true);
    for (const bad of ["", "auto", "Dark", null, undefined, 1]) expect(isThemePreference(bad)).toBe(false);
  });

  it("defaults to system when nothing or something invalid is saved", () => {
    expect(readStoredPreference()).toBe("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readStoredPreference()).toBe("system");
  });

  it("round-trips a saved choice", () => {
    for (const choice of ["light", "dark", "system"] as const) {
      storePreference(choice);
      expect(readStoredPreference()).toBe(choice);
    }
  });

  it("survives storage being unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredPreference()).toBe("system");
    expect(() => storePreference("dark")).not.toThrow();
  });
});

describe("resolveTheme", () => {
  it("follows the system only for the system choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets the dark class and color-scheme", () => {
    applyTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

describe("system theme", () => {
  it("reads the operating system setting, and treats a missing matchMedia as light", () => {
    mockMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);
    mockMatchMedia(false);
    expect(systemPrefersDark()).toBe(false);
    // @ts-expect-error simulating a browser without matchMedia
    window.matchMedia = undefined;
    expect(systemPrefersDark()).toBe(false);
    expect(watchSystemTheme(() => {})()).toBeUndefined();
  });

  it("reports changes and stops when asked", () => {
    const media = mockMatchMedia(false);
    const seen: boolean[] = [];
    const stop = watchSystemTheme((dark) => seen.push(dark));
    media.setDark(true);
    media.setDark(false);
    expect(seen).toEqual([true, false]);
    stop();
    media.setDark(true);
    expect(seen).toEqual([true, false]);
    expect(media.listenerCount()).toBe(0);
  });
});
