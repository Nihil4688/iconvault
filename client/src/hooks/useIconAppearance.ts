// The icon size and colour chosen in a project's toolbar, remembered in this browser for that project. Older saved style overrides are ignored so icons keep their uploaded appearance.
import { useRef, useState } from "react";
import { DEFAULT_APPEARANCE, clampIconSize, isIconColor, type IconAppearance } from "../lib/iconAppearance";

function load(key: string): IconAppearance {
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

export function useIconAppearance(projectId: string): [IconAppearance, (change: Partial<IconAppearance>) => void] {
  const key = `project:${projectId}:iconAppearance`;
  const [appearance, setAppearance] = useState<IconAppearance>(() => load(key));
  // The latest value, so two changes made before a re-render (a drag on the slider, then a click) do not undo each other.
  const latest = useRef(appearance);

  function update(change: Partial<IconAppearance>) {
    const next = { ...latest.current, ...change };
    latest.current = next;
    setAppearance(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The choice still applies until the page is closed.
    }
  }

  return [appearance, update];
}
