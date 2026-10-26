// A row of choices joined into one pill, where exactly one is on (buttons with aria-pressed), each optionally with a count: "All 3 | Private 1 | Public 2".
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type Option<T extends string> = { value: T; label: string; count?: number; icon?: ReactNode };

type SegmentedGroupProps<T extends string> = {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<Option<T>>;
};

export default function SegmentedGroup<T extends string>({ label, value, onChange, options }: SegmentedGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 items-center rounded-xl border border-input bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            value === option.value && "bg-background text-foreground shadow-sm ring-1 ring-border",
          )}
        >
          {option.icon}
          {option.label}
          {option.count !== undefined && <span className="rounded-full bg-background/70 px-1.5 text-xs tabular-nums text-muted-foreground">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
