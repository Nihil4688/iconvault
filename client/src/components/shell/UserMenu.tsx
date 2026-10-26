// The signed-in user's menu in the header: avatar and name as a button that opens a small panel with the account details and Sign out. Closes on Escape (focus returns to the button), on a click outside, and when focus leaves.
import { ChevronDown, KeyRound, LogOut, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CurrentUser } from "../../context/AuthContext";
import { cn } from "../../lib/cn";

const PROVIDER_LABEL: Record<CurrentUser["provider"], string> = { google: "Google", microsoft: "Microsoft" };

const menuItemClass = "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function initialsOf(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : source.slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ user, className }: { user: CurrentUser; className?: string }) {
  if (user.picture) {
    return <img src={user.picture} alt="" referrerPolicy="no-referrer" className={cn("rounded-full object-cover", className)} />;
  }
  return (
    // The initials are drawn by CSS (data-initials) rather than written as text, so they are not part of the button's visible text and its accessible name can match the visible name.
    <span aria-hidden="true" data-initials={initialsOf(user.displayName, user.email)} className={cn("flex items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground after:content-[attr(data-initials)]", className)} />
  );
}

export default function UserMenu({ user, onSignOut }: { user: CurrentUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const signOutRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    signOutRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Focus moved somewhere outside the menu (for example with Tab).
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${user.displayName || user.email}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Avatar user={user} className="h-6 w-6" />
        <span className="hidden max-w-32 truncate font-medium sm:inline">{user.displayName || user.email}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar user={user} className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.displayName || user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2 text-xs text-muted-foreground">
            <span>Signed in with {PROVIDER_LABEL[user.provider]}</span>
            {user.role === "admin" && <span className="rounded-md bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground">Admin</span>}
          </div>
          <div className="border-t border-border pt-1">
            <Link to="/account/tokens" role="menuitem" onClick={() => setOpen(false)} className={menuItemClass}>
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              API tokens
            </Link>
            {user.role === "admin" && (
              <Link to="/admin" role="menuitem" onClick={() => setOpen(false)} className={menuItemClass}>
                <Users aria-hidden="true" className="h-4 w-4" />
                Manage users
              </Link>
            )}
            <button
              ref={signOutRef}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={menuItemClass}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
