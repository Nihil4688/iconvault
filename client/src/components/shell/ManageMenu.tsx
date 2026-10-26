// The "Manage" menu in the top bar, for administrators only: Manage Projects (every project, its owner, transfer and delete) and Manage Users (everyone who signed in, their projects, delete). Keyboard: Arrow Down/Up open it, arrows/Home/End move, Escape closes and returns focus to the button.
import { ChevronDown, FolderKanban, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn";

const ITEMS: { to: string; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { to: "/admin/projects", label: "Manage Projects", hint: "View all projects, owners, transfer & delete", icon: FolderKanban, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  { to: "/admin", label: "Manage Users", hint: "See who signed in, their projects, and remove users", icon: Users, tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
];

export default function ManageMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []);

  function openAndFocus(index: number) {
    setOpen(true);
    requestAnimationFrame(() => {
      const list = items();
      (list[index < 0 ? list.length - 1 : index] ?? list[0])?.focus();
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus(event.key === "ArrowDown" ? 0 : -1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLAnchorElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-indigo-300"
      >
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        Manage
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Admin tools" onKeyDown={onMenuKeyDown} className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin tools</p>
          {ITEMS.map(({ to, label, hint, icon: Icon, tone }) => (
            <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="mt-1 flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
