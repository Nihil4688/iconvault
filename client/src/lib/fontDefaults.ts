// The font options a project starts with. The Font page uses them as its initial settings, and the Icons screen uses the same ones when "Build font" builds straight from a selection, so a font built from either place is the same.
import type { BuildFontInput } from "../api/types";

export type FontDefaults = Required<Pick<BuildFontInput, "formats" | "fontName" | "prefix" | "baseClass" | "startCodepoint" | "fontHeight" | "descent" | "normalize">>;

export function defaultFontOptions(project: { name: string; prefix: string }): FontDefaults {
  return {
    formats: ["woff2", "woff", "ttf"],
    fontName: project.name.replace(/[^a-zA-Z0-9_-]/g, "") || "IconFont",
    prefix: project.prefix || "icon",
    baseClass: "",
    startCodepoint: "E001",
    fontHeight: 1000,
    descent: 0,
    normalize: true,
  };
}
