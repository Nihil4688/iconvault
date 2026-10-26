// The "More" button in the icon toolbar: a menu of extra view options. Today it holds the preview background (Match theme, Light, Dark, Checkerboard) as a single-choice list. Keyboard: Enter, Space or the arrows open it, arrows/Home/End move, Enter or Space picks, Escape closes and returns focus to the button.
import { Check, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import { SURFACES, SURFACE_LABELS, type Surface } from "../../lib/previewSurface";

export default function MoreMenu({ surface, onSurface }: { surface: Surface; onSurface: (surface: Surface) => void }) {
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

  function items(): HTMLButtonElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
  }

  function openAndFocus(index: number) {
    setOpen(true);
    requestAnimationFrame(() => {
      const list = items();
      (list[index < 0 ? list.length - 1 : index] ?? list[0])?.focus();
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAndFocus(Math.max(0, SURFACES.indexOf(surface)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus(-1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
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
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        More
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="More view options" onKeyDown={onMenuKeyDown} className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <p className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview background</p>
          {SURFACES.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={surface === value}
              onClick={() => {
                onSurface(value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", surface === value && "font-semibold")}
            >
              <Check aria-hidden="true" className={cn("h-4 w-4 shrink-0", surface === value ? "text-primary" : "invisible")} />
              {SURFACE_LABELS[value]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
