// A project-specific choice (such as grid or list view) remembered in this browser. Falls back to the default when nothing valid is saved or storage is blocked.
import { useState } from "react";

export function projectChoiceKey(projectId: string, storageKey: string): string {
  return `project:${projectId}:${storageKey}`;
}

export function usePersistentChoice<T extends string>(projectId: string, storageKey: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const scopedKey = projectChoiceKey(projectId, storageKey);
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(scopedKey);
      return allowed.includes(saved as T) ? (saved as T) : fallback;
    } catch {
      return fallback;
    }
  });

  function update(next: T) {
    setValue(next);
    try {
      window.localStorage.setItem(scopedKey, next);
    } catch {
      // The choice still applies until the page is closed.
    }
  }

  return [value, update];
}
