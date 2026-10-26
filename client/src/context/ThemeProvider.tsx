// Provides the colour theme. Remembers the choice, follows the operating system while the choice is "system", applies the result to <html>, and stays in step across browser tabs.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  watchSystemTheme,
  type ThemePreference,
} from "../lib/theme";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => watchSystemTheme(setPrefersDark), []);

  // Another tab changed the choice.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(isThemePreference(event.newValue) ? event.newValue : "system");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    storePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
