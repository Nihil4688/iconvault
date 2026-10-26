// The "Select all N shown" checkbox that sits above the icon list (not in the toolbar). A partial selection shows as indeterminate.
import { useEffect, useRef } from "react";

type SelectAllBarProps = {
  // How many icons are shown and how many of them are selected.
  loaded: number;
  selected: number;
  onSelectAll: (checked: boolean) => void;
};

export default function SelectAllBar({ loaded, selected, onSelectAll }: SelectAllBarProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const all = loaded > 0 && selected === loaded;
  const some = selected > 0 && selected < loaded;

  // "Indeterminate" is a property of the element, not an attribute.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <input ref={ref} type="checkbox" checked={all} disabled={loaded === 0} onChange={(event) => onSelectAll(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
      Select all {loaded} shown
    </label>
  );
}
