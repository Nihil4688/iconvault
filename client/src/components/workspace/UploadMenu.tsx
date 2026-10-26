// The "Upload icons" split button above the icon list. The main part opens the upload dialog; the chevron opens a menu of every way to add icons (files or ZIP, another project, an SVG sprite, an icon font, pasted SVG code). Keyboard: Enter/Space/ArrowDown open it, arrows/Home/End move, Escape closes and returns focus to the chevron.
import { ChevronDown, Code2, FileUp, FolderInput, Layers, Type, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import Badge from "../ui/Badge";

export type UploadKind = "files" | "copy" | "sprite" | "font" | "paste";

const ITEMS: { kind: UploadKind; label: string; hint: string; icon: LucideIcon; isNew?: boolean }[] = [
  { kind: "files", label: "Upload Files / ZIP", hint: "Upload SVGs or drag & drop ZIP files", icon: FileUp },
  { kind: "copy", label: "From Another Project", hint: "Select and copy icons from other workspaces", icon: FolderInput, isNew: true },
  { kind: "sprite", label: "Import SVG Sprite", hint: "Extract symbols from an SVG sprite file", icon: Layers },
  { kind: "font", label: "Import Icon Font", hint: "Extract glyphs from TTF, WOFF, WOFF2", icon: Type },
  { kind: "paste", label: "Paste SVG Code", hint: "Paste raw SVG markup directly", icon: Code2 },
];

export default function UploadMenu({ onSelect }: { onSelect: (kind: UploadKind) => void }) {
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
    return Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  }

  function focusAfterOpen(index: number) {
    setOpen(true);
    requestAnimationFrame(() => {
      const list = items();
      list[index < 0 ? list.length - 1 : index]?.focus();
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAfterOpen(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAfterOpen(-1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => onSelect("files")}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-l-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Upload aria-hidden="true" className="h-4 w-4" />
        Upload icons
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="More ways to add icons"
        title="More ways to add icons"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex h-9 w-9 items-center justify-center rounded-r-lg border-l border-primary-foreground/30 bg-primary text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Add icons" onKeyDown={onMenuKeyDown} className="absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <p className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add icons</p>
          {ITEMS.map(({ kind, label, hint, icon: Icon, isNew }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                onSelect(kind);
              }}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {label}
                  {isNew && <Badge>New</Badge>}
                </span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
