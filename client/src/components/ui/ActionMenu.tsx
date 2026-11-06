// A "more actions" menu button. Opens a list of actions; Arrow keys move between them, Home and End jump, Escape closes and returns focus to the button, and a click outside or tabbing away closes it. Disabled actions are skipped by the keys.
import { MoreVertical } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type MenuAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type ActionMenuProps = {
  // Names the button for screen readers, for example "Actions for Feather".
  label: string;
  actions: MenuAction[];
  className?: string;
};

type MenuPosition = {
  left: number;
  top: number;
  maxHeight: number;
  constrained: boolean;
};

export default function ActionMenu({ label, actions, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  function isInside(target: EventTarget | null) {
    return target instanceof Node && Boolean(rootRef.current?.contains(target) || menuRef.current?.contains(target));
  }

  useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!isInside(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const margin = 8;
      const gap = 4;
      const menuWidth = menuRect.width;
      const menuHeight = Math.max(menuRect.height, menu.scrollHeight);
      const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - margin);
      const spaceAbove = Math.max(0, triggerRect.top - margin);
      const opensAbove = menuHeight > spaceBelow && spaceAbove > spaceBelow;
      const availableHeight = opensAbove ? spaceAbove : spaceBelow;
      const constrained = menuHeight > availableHeight;
      const maxHeight = Math.min(menuHeight, availableHeight);
      const left = Math.max(margin, Math.min(triggerRect.right - menuWidth, viewportWidth - menuWidth - margin));
      const requestedTop = opensAbove
        ? triggerRect.top - maxHeight - gap
        : triggerRect.bottom + gap;
      const top = Math.max(margin, Math.min(requestedTop, viewportHeight - maxHeight - margin));

      setPosition({ left, top, maxHeight, constrained });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, actions.length]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onBlur={(event) => {
        if (open && !isInside(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            onBlur={(event) => {
              if (!isInside(event.relatedTarget)) setOpen(false);
            }}
            style={{
              position: "fixed",
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              maxHeight: position ? `${position.maxHeight}px` : undefined,
              maxWidth: "calc(100vw - 16px)",
              overflowY: position?.constrained ? "auto" : undefined,
              visibility: position ? "visible" : "hidden",
            }}
            className="z-30 min-w-44 w-max rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  action.onSelect();
                }}
                className={cn(
                  "flex min-w-8 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                  action.destructive ? "text-destructive" : "text-foreground",
                )}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      )}
    </div>
  );
}
