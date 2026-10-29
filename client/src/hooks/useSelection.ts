// A set of selected ids. The selection is persistent: it does not reset when `resetKey` changes, so a selection survives tab navigation, a folder change or a list refresh. Call `clear()` to deselect.
import { useState } from "react";

export type Selection = {
  ids: string[];
  size: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  // Replace the selection with an exact list. Useful when a checklist confirms a new set of ids.
  set: (ids: string[]) => void;
};

// `resetKey` is accepted for backwards compatibility with previous call sites, but no longer triggers an automatic reset. Pass the same key across renders so the hook's identity stays stable; switching projects resets the selection through the surrounding provider.
export function useSelection(resetKey: string): Selection {
  const [ids, setIds] = useState<string[]>([]);
  void resetKey;
  return {
    ids,
    size: ids.length,
    has: (id) => ids.includes(id),
    toggle: (id) => setIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id])),
    selectAll: (all) => setIds([...all]),
    clear: () => setIds([]),
    set: (next) => setIds([...next]),
  };
}
