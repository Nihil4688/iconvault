import { ChevronDown, Folder } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { FolderWithCount } from "../../api/types";
import { cn } from "../../lib/cn";
import { buildFolderTree, flattenFolderTree } from "../../lib/folderTree";

type FolderOption = {
  value: string;
  label: string;
  menuLabel: string;
  depth: number;
  connectorContinuations: number[];
  hasNextSibling: boolean;
};

type FolderDropdownSelectProps = {
  value: string;
  folders: FolderWithCount[];
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  rootLabel?: string;
  error?: string;
  disabled?: boolean;
};

export default function FolderDropdownSelect({ value, folders, onChange, id, label, rootLabel = "Uncategorized (Project Root)", error, disabled = false }: FolderDropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const initialFocusIndex = useRef(0);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const menuId = useId();
  const folderNodes = flattenFolderTree(buildFolderTree(folders));
  const foldersByParent = new Map<string, typeof folderNodes>();
  const folderById = new Map(folderNodes.map((folder) => [folder.id, folder]));

  for (const folder of folderNodes) {
    const siblings = foldersByParent.get(folder.parentId ?? "") ?? [];
    siblings.push(folder);
    foldersByParent.set(folder.parentId ?? "", siblings);
  }

  const hasNextSibling = new Map<string, boolean>();
  for (const siblings of foldersByParent.values()) {
    siblings.forEach((folder, index) => hasNextSibling.set(folder.id, index < siblings.length - 1));
  }

  const getConnectorLeft = (depth: number) => 18 + (depth - 1) * 30;
  const options: FolderOption[] = [
    {
      value: "",
      label: rootLabel,
      menuLabel: rootLabel,
      depth: 0,
      connectorContinuations: [],
      hasNextSibling: false,
    },
    ...folderNodes.map((folder) => {
      const ancestors = [];
      let parent = folder.parentId ? folderById.get(folder.parentId) : undefined;
      while (parent) {
        ancestors.unshift(parent);
        parent = parent.parentId ? folderById.get(parent.parentId) : undefined;
      }

      return {
        value: folder.id,
        label: `${"\u00a0\u00a0".repeat(folder.depth)}${folder.name}`,
        menuLabel: folder.name,
        depth: folder.depth,
        connectorContinuations: ancestors
          .filter((ancestor) => ancestor.depth > 0 && (hasNextSibling.get(ancestor.id) ?? false))
          .map((ancestor) => getConnectorLeft(ancestor.depth + 1)),
        hasNextSibling: hasNextSibling.get(folder.id) ?? false,
      };
    }),
  ];

  const selectedOption = options.find((option) => option.value === value) ?? options[0];
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
    if (!open || !portalTarget) return;
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
  }, [open, portalTarget]);

  useEffect(() => {
    if (!open || !portalTarget) return;
    const list = items();
    (list[initialFocusIndex.current < 0 ? list.length - 1 : initialFocusIndex.current] ?? list[0])?.focus();
  }, [open, portalTarget]);

  function openAndFocus(index: number) {
    initialFocusIndex.current = index;
    setPortalTarget(triggerRef.current?.closest("dialog") ?? document.body);
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
      className="relative w-full"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (open && !event.currentTarget.contains(nextTarget) && !menuRef.current?.contains(nextTarget)) setOpen(false);
      }}
    >
      {label && (
        <label htmlFor={triggerId} className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-label={`Folder: ${selectedOption.label}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${triggerId}-error` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) setOpen(false);
          else openAndFocus(options.findIndex((option) => option.value === value));
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          "group",
          open && "shadow-[0_0_0_3px_rgba(21,85,224,0.2)] border-[#1555E0]",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 truncate">
          <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{selectedOption.label}</span>
        </div>
        <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-muted-foreground group-aria-expanded:rotate-180" />
      </button>
      {error && (
        <p id={`${triggerId}-error`} className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {open && portalTarget && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Folder"
          onKeyDown={onMenuKeyDown}
          style={menuPosition ?? { position: "fixed", visibility: "hidden" }}
          className="fixed left-0 right-auto top-0 z-50 mt-0 max-h-55 w-full min-w-0 max-w-none overflow-y-auto whitespace-normal rounded-lg border border-border bg-popover px-1 pb-1 text-popover-foreground shadow-xl custom-scrollbar"
        >
          {options.map((option) => {
            const selected = value === option.value;
            const depth = option.depth;
            const connectorLeft = depth > 0 ? getConnectorLeft(depth) : 0;

            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  onChange(option.value);
                }}
                className={cn(
                  "group/option mt-1 flex w-full items-center rounded-lg text-left text-sm transition-colors focus-visible:outline-none",
                  depth > 0 ? "p-0" : "p-1.5",
                  depth === 0 && "hover:bg-accent focus-visible:bg-accent",
                  selected && depth === 0 && "bg-accent text-accent-foreground",
                )}
              >
                {depth === 0 ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="truncate">{option.menuLabel}</span>
                  </span>
                ) : (
                  <span className="folder-option-row relative flex min-w-0 flex-1 items-center gap-2 py-2 pr-2" style={{ paddingLeft: `${connectorLeft}px` }}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "folder-option-highlight pointer-events-none absolute inset-y-0 right-0 rounded-lg transition-colors group-hover/option:bg-accent group-focus-visible/option:bg-accent",
                        selected && "bg-accent text-accent-foreground",
                      )}
                      style={{ left: `${connectorLeft + 12}px` }}
                    />
                    {option.connectorContinuations.map((left) => (
                      <span
                        key={left}
                        aria-hidden="true"
                        className="absolute z-10 border-l-2 border-border"
                        style={{ left: `${left}px`, top: "-2px", bottom: "-2px" }}
                      />
                    ))}
                    <span
                      aria-hidden="true"
                      className="folder-tree-connector folder-tree-connector-above absolute z-10 border-l-2 border-border"
                      style={{ left: `${connectorLeft}px`, top: "-2px", bottom: "50%" }}
                    />
                    {option.hasNextSibling && (
                      <span
                        aria-hidden="true"
                        className="folder-tree-connector folder-tree-connector-below absolute z-10 border-l-2 border-border"
                        style={{ left: `${connectorLeft}px`, top: "50%", bottom: "-2px" }}
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className="folder-tree-connector folder-tree-connector-elbow absolute z-10 border-b-2 border-border"
                      style={{ left: `${connectorLeft}px`, top: "50%", width: "12px" }}
                    />
                    <span aria-hidden="true" className="h-3 w-3 shrink-0" />
                    <Folder aria-hidden="true" className="relative z-10 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="relative z-10 truncate">{option.menuLabel}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        portalTarget,
      )}
    </div>
  );
}
