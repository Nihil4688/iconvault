// Reads the colour theme and changes it. Must be used inside <ThemeProvider>.
import { useContext } from "react";
import { ThemeContext, type ThemeContextValue } from "../context/themeContext";

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
