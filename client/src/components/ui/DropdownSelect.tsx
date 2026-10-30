import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type DropdownOption = { value: string; label: string };

type DropdownSelectProps = {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  children: ReactNode;
  triggerClassName: string;
  rootClassName?: string;
  title?: string;
};

export default function DropdownSelect({ label, value, options, onChange, children, triggerClassName, rootClassName, title }: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialFocusIndex = useRef(0);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = items();
    (list[initialFocusIndex.current < 0 ? list.length - 1 : initialFocusIndex.current] ?? list[0])?.focus();
  }, [open]);

  function openAndFocus(index: number) {
    initialFocusIndex.current = index;
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

  return (
    <div
      ref={rootRef}
      className={cn("relative", rootClassName)}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
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
          open && "shadow-[0_0_0_3px_rgba(21,85,224,0.5)]",
        )}
      >
        {children}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-max min-w-32 max-w-[calc(100vw-2rem)] whitespace-nowrap rounded-lg border border-border bg-popover px-1 pb-1 text-popover-foreground shadow-xl"
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
                "mt-1 flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                value === option.value && "bg-accent text-accent-foreground",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {value === option.value && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
              </span>
              <span className="whitespace-nowrap">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
