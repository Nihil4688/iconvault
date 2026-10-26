// The theme context object and its value type. The provider lives in ThemeProvider.tsx and the hook in hooks/useTheme.ts.
import { createContext } from "react";
import type { ResolvedTheme, ThemePreference } from "../lib/theme";

export type ThemeContextValue = {
  // What the user chose: light, dark, or follow the system.
  preference: ThemePreference;
  // What is actually shown right now.
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
