// A rounded square in the project's accent colour with its first letter.
import { cn } from "../../lib/cn";

export default function ProjectAvatar({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white", className)} style={{ backgroundColor: color }}>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
