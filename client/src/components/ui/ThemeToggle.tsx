// Three-way colour theme switch: light, follow the system, dark. Each option is a real button with a text label for screen readers; the selected one is marked with aria-pressed.
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { cn } from "../../lib/cn";
import { THEME_PREFERENCES, type ThemePreference } from "../../lib/theme";

const OPTIONS: Record<ThemePreference, { label: string; Icon: LucideIcon }> = {
  light: { label: "Light", Icon: Sun },
  system: { label: "System", Icon: Monitor },
  dark: { label: "Dark", Icon: Moon },
};

export default function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div role="group" aria-label="Color theme" className={cn("inline-flex h-9 items-center rounded-lg border border-border bg-muted p-0.5", className)}>
      {THEME_PREFERENCES.map((value) => {
        const { label, Icon } = OPTIONS[value];
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            title={`${label} theme`}
            onClick={() => setPreference(value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              selected && "bg-background text-foreground shadow-sm ring-1 ring-border",
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
