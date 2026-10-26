// Tabs inside a dialog or panel. Follows the standard pattern: one tab is in the tab order, Left/Right/Home/End move between tabs, and each panel is tied to its tab.
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type TabsProps<T extends string> = {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ value: T; label: string }>;
  // Renders the panel for the current tab.
  children: ReactNode;
};

export default function Tabs<T extends string>({ label, value, onChange, tabs, children }: TabsProps<T>) {
  const baseId = useId();
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.value === value);
    const count = tabs.length;
    const targets: Record<string, number> = { ArrowRight: (index + 1) % count, ArrowLeft: (index - 1 + count) % count, Home: 0, End: count - 1 };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = tabs[next];
    if (target) {
      onChange(target.value);
      refs.current.get(target.value)?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            ref={(node) => {
              if (node) refs.current.set(tab.value, node);
              else refs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.value}`}
            aria-selected={value === tab.value}
            aria-controls={`${baseId}-panel`}
            tabIndex={value === tab.value ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              value === tab.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${value}`} className="pt-4">
        {children}
      </div>
    </div>
  );
}
