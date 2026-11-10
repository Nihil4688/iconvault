import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type DropdownOption = { value: string; label: string };

type DropdownSelectProps = {
  id?: string;
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  children: ReactNode;
  triggerClassName: string;
  rootClassName?: string;
  menuClassName?: string;
  portalMenu?: boolean;
  showSelectedCheck?: boolean;
  showChevron?: boolean;
  title?: string;
};

export default function DropdownSelect({ id, label, value, options, onChange, children, triggerClassName, rootClassName, menuClassName, portalMenu = false, showSelectedCheck = true, showChevron = true, title }: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialFocusIndex = useRef(0);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !portalMenu) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 4;
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
      const below = window.innerHeight - rect.bottom - viewportPadding - gap;
      const above = rect.top - viewportPadding - gap;
      const maxMenuHeight = 220;
      const desiredHeight = Math.min(menu.scrollHeight, maxMenuHeight);
      const placeBelow = desiredHeight <= below || below >= above;
      const maxHeight = Math.min(maxMenuHeight, Math.max(0, placeBelow ? below : above));

      setMenuPosition({
        position: "fixed",
        top: placeBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - Math.min(menu.scrollHeight, maxHeight) - gap),
        left,
        width,
        maxHeight,
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
  }, [open, portalMenu, portalTarget]);

  useEffect(() => {
    if (!open || (portalMenu && !portalTarget)) return;
    const list = items();
    (list[initialFocusIndex.current < 0 ? list.length - 1 : initialFocusIndex.current] ?? list[0])?.focus();
  }, [open, portalMenu, portalTarget]);

  function openAndFocus(index: number) {
    initialFocusIndex.current = index;
    if (portalMenu) setPortalTarget(triggerRef.current?.closest("dialog") ?? document.body);
    setOpen(true);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus(event.key === "ArrowDown" ? 0 : -1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      if (list.length === 0) return;
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

  const menu = open && (!portalMenu || portalTarget) ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKeyDown}
      style={portalMenu ? menuPosition ?? { position: "fixed", visibility: "hidden" } : undefined}
      className={cn(
        "absolute right-0 top-full z-50 mt-2 min-w-32 max-w-[calc(100vw-2rem)] whitespace-nowrap rounded-lg border border-border bg-popover px-1 pb-1 text-popover-foreground shadow-xl custom-scrollbar overflow-y-auto",
        portalMenu && "fixed left-0 right-auto top-0 mt-0 w-full min-w-0 max-w-none max-h-55 whitespace-normal",
        menuClassName,
      )}
    >
      {/* <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p> */}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={value === option.value}
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
            onChange(option.value);
          }}
          className={cn(
            "mt-1 flex w-full items-center rounded-lg p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
            showSelectedCheck && "gap-2",
            value === option.value && "bg-accent text-accent-foreground",
          )}
        >
          {showSelectedCheck && (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {value === option.value && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
            </span>
          )}
          <span className="whitespace-nowrap truncate">{option.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn("relative", rootClassName)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (open && !event.currentTarget.contains(nextTarget) && !menuRef.current?.contains(nextTarget)) setOpen(false);
      }}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={title}
        onClick={() => {
          if (open) setOpen(false);
          else openAndFocus(options.findIndex((option) => option.value === value));
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          triggerClassName,
          "group",
          open && "shadow-[0_0_0_3px_rgba(21,85,224,0.2)] border-[#1555E0]",
        )}
      >
        {children}
        {showChevron && <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />}
      </button>
      {portalMenu && menu ? createPortal(menu, portalTarget as HTMLElement) : menu}
    </div>
  );
}
