// A set of selected ids for a list. It starts empty again whenever `resetKey` changes (for example after the list is reloaded or the folder changes), without any effect running.
import { useState } from "react";

export type Selection = {
  ids: string[];
  size: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
};

export function useSelection(resetKey: string): Selection {
  const [state, setState] = useState<{ key: string; ids: string[] }>({ key: resetKey, ids: [] });
  const ids = state.key === resetKey ? state.ids : [];

  return {
    ids,
    size: ids.length,
    has: (id) => ids.includes(id),
    toggle: (id) => setState({ key: resetKey, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }),
    selectAll: (all) => setState({ key: resetKey, ids: [...all] }),
    clear: () => setState({ key: resetKey, ids: [] }),
  };
}
