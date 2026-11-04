// The preview background picker in the icon toolbar. Keyboard: Enter, Space or the arrows open it, arrows/Home/End move, Enter or Space picks, Escape closes and returns focus to the button.
import { Check, ChevronDown, PanelsTopLeft } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import { SURFACES, SURFACE_LABELS, type Surface } from "../../lib/previewSurface";

export default function MoreMenu({ surface, onSurface, disabled = false }: { surface: Surface; onSurface: (surface: Surface) => void; disabled?: boolean }) {
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
      const selectedIndex = list.findIndex((item) => item.getAttribute("aria-checked") === "true");
      (list[index < 0 ? list.length - 1 : index === 0 ? Math.max(selectedIndex, 0) : index] ?? list[0])?.focus();
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
        disabled={disabled}
        aria-label="Preview background"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        title="Preview background"
        className="inline-flex h-9 w-12 items-center justify-center gap-1 rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <PanelsTopLeft aria-hidden="true" className="h-4 w-4" />
        <ChevronDown aria-hidden="true" className="h-3 w-3" />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Preview background options" onKeyDown={onMenuKeyDown} className="absolute right-0 top-full z-30 mt-2 flex w-[min(12rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="pb-2 text-sm font-semibold">Preview Background</p>
          <div className="flex flex-col gap-1">
            {SURFACES.map((value) => {
              const selected = surface === value;
              const backgroundClass = value === "dark" ? "bg-neutral-900" : value === "light" ? "bg-white" : value === "theme" ? "bg-background" : "";
              const backgroundStyle = value === "checker"
                ? { background: "conic-gradient(#d1d5db 25%, #fff 0 50%, #d1d5db 0 75%, #fff 0)", backgroundSize: "10px 10px" }
                : value === "theme"
                  ? { background: "linear-gradient(135deg, #fff 50%, #1f2937 50%)" }
                  : undefined;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onSurface(value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={cn(
                    "relative flex min-h-14 w-full flex-row items-center justify-start gap-3 rounded-lg border px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    selected ? "border-primary bg-primary/5" : "border-transparent",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("h-10 w-10 shrink-0 rounded-full border-2", selected ? "border-primary" : "border-border", backgroundClass)}
                    style={backgroundStyle}
                  />
                  <span>{SURFACE_LABELS[value]}</span>
                  {selected && (
                    <span aria-hidden="true" className="absolute -top-2 -right-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Check aria-hidden="true" className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
