// Top bar for every screen: brand, an empty middle where a screen can place its breadcrumb, the Manage menu (admins only), the colour theme switch, and either a Sign in button or the user menu. It is fixed and 57px tall; pages leave that much room at the top.
import { LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { reloadPage } from "../../lib/navigation";
import ThemeToggle from "../ui/ThemeToggle";
import ManageMenu from "./ManageMenu";
import UserMenu from "./UserMenu";

type AppHeaderProps = {
  onSignIn: () => void;
  // Receives the element where a screen can place its breadcrumb (see HeaderSlotContext).
  crumbRef?: (node: HTMLDivElement | null) => void;
  // Receives the element where a screen can place its main buttons (see HeaderActionsContext).
  actionsRef?: (node: HTMLDivElement | null) => void;
};

export default function AppHeader({ onSignIn, crumbRef, actionsRef }: AppHeaderProps) {
  const { currentUser, logout } = useAuth();

  async function handleSignOut() {
    await logout();
    reloadPage();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-[57px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="hidden truncate font-bold tracking-tight text-foreground sm:inline">IconVault</span>
        </Link>
      </div>

      {/* Middle of the bar: a screen can place its breadcrumb here. */}
      <div ref={crumbRef} className="mx-3 flex min-w-0 flex-1 justify-center empty:hidden" />

      <div className="flex shrink-0 items-center gap-3">
        <div ref={actionsRef} className="flex items-center gap-2 empty:hidden" />
        {currentUser?.role === "admin" && <ManageMenu />}
        <ThemeToggle />
        {currentUser ? (
          <UserMenu user={currentUser} onSignOut={handleSignOut} />
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
