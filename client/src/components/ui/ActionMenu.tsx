// A "more actions" menu button. Opens a list of actions; Arrow keys move between them, Home and End jump, Escape closes and returns focus to the button, and a click outside or tabbing away closes it. Disabled actions are skipped by the keys.
import { MoreVertical } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

export default function ActionMenu({ label, actions, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !portalTarget) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const rect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 4;
      const width = Math.min(menuRect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(rect.right - width, viewportPadding), window.innerWidth - width - viewportPadding);
      const below = window.innerHeight - rect.bottom - viewportPadding - gap;
      const above = rect.top - viewportPadding - gap;
      const desiredHeight = Math.min(Math.max(menu.scrollHeight, menuRect.height), 220);
      const placeBelow = desiredHeight <= below || below >= above;
      const maxHeight = Math.min(220, Math.max(0, placeBelow ? below : above));
      const height = Math.min(Math.max(menu.scrollHeight, menuRect.height), maxHeight);

      setMenuPosition({
        position: "fixed",
        top: placeBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - height - gap),
        left,
        maxHeight,
        maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
        overflowY: "auto",
        visibility: "visible",
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, portalTarget]);

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
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
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
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setPortalTarget(triggerRef.current?.closest("dialog") ?? document.body);
          setMenuPosition(null);
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && portalTarget && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null) && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          style={menuPosition ?? { position: "fixed", visibility: "hidden" }}
          className="z-50 min-w-44 w-max y rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
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
        portalTarget,
      )}
    </div>
  );
}
