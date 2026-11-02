// The icon size and colour chosen in a folder's toolbar, remembered separately for each folder in this project.
import { useRef, useState } from "react";
import { DEFAULT_APPEARANCE, clampIconSize, isIconColor, type IconAppearance } from "../lib/iconAppearance";

function storageKey(projectId: string, folderId: string | null | undefined): string {
  const scope = folderId === undefined ? "all" : folderId ?? "root";
  return `project:${projectId}:folder:${scope}:iconAppearance`;
}

function load(key: string | null): IconAppearance {
  if (!key) return DEFAULT_APPEARANCE;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<IconAppearance> | null;
    if (!saved || typeof saved !== "object") return DEFAULT_APPEARANCE;
    return {
      size: typeof saved.size === "number" ? clampIconSize(saved.size) : DEFAULT_APPEARANCE.size,
      color: isIconColor(saved.color) ? saved.color : DEFAULT_APPEARANCE.color,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function useIconAppearance(
  projectId: string,
  folderId?: string | null,
): [IconAppearance, (change: Partial<IconAppearance>) => void, (folderId: string | null) => IconAppearance] {
  const key = storageKey(projectId, folderId);
  const [appearances, setAppearances] = useState<Record<string, IconAppearance>>({});
  const appearance = appearances[key] ?? load(key);
  // The latest value, so two changes made before a re-render (a drag on the slider, then a click) do not undo each other.
  const latest = useRef({ key, appearance });

  function update(change: Partial<IconAppearance>) {
    if (!key) return;
    const current = latest.current.key === key ? latest.current.appearance : appearances[key] ?? appearance;
    const next = { ...current, ...change };
    latest.current = { key, appearance: next };
    setAppearances((currentAppearances) => ({ ...currentAppearances, [key]: next }));
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The choice still applies until the page is closed.
    }
  }

  function getForFolder(targetFolderId: string | null): IconAppearance {
    if (folderId === undefined) return appearance;
    const targetKey = storageKey(projectId, targetFolderId);
    return appearances[targetKey] ?? load(targetKey);
  }

  return [appearance, update, getForFolder];
}
