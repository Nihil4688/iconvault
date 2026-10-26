// A small label such as "Public", "Sprite" or "Archived". Always includes text, so meaning never depends on colour or an icon alone.
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export default function Badge({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground", className)}>
      {icon}
      {children}
    </span>
  );
}
