// A small breadcrumb above the title of an admin screen: Dashboard / Manage users (or Manage projects). The first part goes back to the dashboard.
import { Link } from "react-router-dom";

export default function AdminCrumb({ page }: { page: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <li>
          <Link to="/" className="rounded-sm hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Dashboard
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="font-medium text-foreground">
          {page}
        </li>
      </ol>
    </nav>
  );
}
