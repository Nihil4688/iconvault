// The "Select all N shown" checkbox that sits above the icon list (not in the toolbar). A partial selection shows as indeterminate.
import { useEffect, useRef } from "react";

type SelectAllBarProps = {
  // How many icons are shown and how many of them are selected.
  loaded: number;
  selected: number;
  disabled?: boolean;
  onSelectAll: (checked: boolean) => void;
};

export default function SelectAllBar({ loaded, selected, disabled = false, onSelectAll }: SelectAllBarProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const all = loaded > 0 && selected === loaded;
  const some = selected > 0 && selected < loaded;

  // "Indeterminate" is a property of the element, not an attribute.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <label className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${disabled ? "\!cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
      <input ref={ref} type="checkbox" checked={all} disabled={disabled || loaded === 0} onChange={(event) => onSelectAll(event.target.checked)} className={`h-4 w-4 accent-primary ${disabled ? "\!cursor-not-allowed opacity-50" : "cursor-pointer"}`} />
      Select All {loaded} Shown
    </label>
  );
}
