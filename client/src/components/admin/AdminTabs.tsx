// The two admin screens as tabs under the page title: Users and Projects.
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-7 items-center rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    isActive ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
  );

export default function AdminTabs() {
  return (
    <nav aria-label="Administration sections" className="mt-4 inline-flex min-h-9 items-center gap-1 rounded-xl border border-border bg-muted p-0.5">
      <NavLink to="/admin" end className={linkClass}>
        Users
      </NavLink>
      <NavLink to="/admin/projects" className={linkClass}>
        Projects
      </NavLink>
    </nav>
  );
}
