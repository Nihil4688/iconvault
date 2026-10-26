// The Manage users screen: every user with their projects, icons and active API tokens, a search, and deleting a user (their projects can move to another user first). Only admins can open it; anyone else is sent to the dashboard.
import { FolderKanban, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { listUsers } from "../api/admin";
import type { AdminUser } from "../api/types";
import { UserStatCards } from "../components/admin/AdminStats";
import { useAdminStats } from "../hooks/useAdminStats";
import AdminCrumb from "../components/admin/AdminCrumb";
import AdminTabs from "../components/admin/AdminTabs";
import DeleteUserDialog from "../components/admin/DeleteUserDialog";
import { Button } from "../components/ui/Button";
import SegmentedGroup from "../components/ui/SegmentedGroup";
import Badge from "../components/ui/Badge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDebounced } from "../hooks/useDebounced";
import { useResource } from "../hooks/useResource";
import { formatRelative, pluralize } from "../lib/format";

const PAGE_SIZE = 25;

export default function AdminPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText.trim(), 300);
  const [pageState, setPageState] = useState({ search: "", page: 1 });
  const page = pageState.search === search ? pageState.page : 1;
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const isAdmin = currentUser?.role === "admin";
  const [provider, setProvider] = useState<"all" | "google" | "microsoft">("all");
  const stats = useAdminStats(statsVersion);
  const users = useResource(isAdmin ? `admin-users:${provider}:${search}:${page}` : null, () => listUsers({ ...(provider !== "all" ? { provider } : {}), ...(search ? { search } : {}), page, limit: PAGE_SIZE }));

  if (!isAdmin) return <Navigate to="/" replace />;

  const rows = users.data?.users ?? [];
  const total = users.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-[calc(57px+2rem)] outline-none">
      <AdminCrumb page="Manage users" />
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Manage users</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Everyone who has signed in. Users are created by signing in with Google or Microsoft, and there are no passwords to manage. Admins are the emails in the server’s ADMIN_EMAILS setting.</p>

      <AdminTabs />
      <UserStatCards stats={stats} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label htmlFor="admin-search" className="sr-only">
          Search users
        </label>
        <input id="admin-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search by name or email" autoComplete="off" className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring" />
        <SegmentedGroup
          label="Sign-in"
          value={provider}
          onChange={(value) => {
            setProvider(value);
            setPageState({ search, page: 1 });
          }}
          options={[
            { value: "all", label: "All", count: stats.data?.users },
            { value: "google", label: "Google", count: stats.data?.googleUsers },
            { value: "microsoft", label: "Microsoft", count: stats.data?.microsoftUsers },
          ]}
        />
      </div>

      {users.error && !users.data ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-6 text-center">
          <p className="font-medium text-destructive">{users.error.message}</p>
          <Button className="mt-3" onClick={users.reload}>
            Try again
          </Button>
        </div>
      ) : !users.data ? (
        <div aria-busy="true" aria-label="Loading users" className="mt-4 h-48 animate-pulse rounded-xl bg-muted" />
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{search ? `No users match “${search}”.` : provider !== "all" ? "No users sign in with that provider." : "There are no users."}</p>
      ) : (
        <>
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {pluralize(total, "user")}
          </p>
          {/* `relative` keeps the table's visually hidden text inside this scroll box (see IconList). */}
          <div className={`relative mt-2 overflow-x-auto rounded-xl border border-border ${users.loading ? "opacity-60" : ""}`}>
            <table className="w-full min-w-3xl text-left text-sm">
              <caption className="sr-only">Users</caption>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">User</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sign-in</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Projects</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Icons</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tokens</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last sign-in</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{user.displayName}</span>
                        {user.isAdmin && <Badge>Admin</Badge>}
                        {user.isSelf && <Badge>You</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </td>
                    <td className="px-3 py-2 capitalize">{user.provider}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{user.projectCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{user.iconCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{user.activeTokens}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.lastLoginAt ? formatRelative(user.lastLoginAt) : "Never"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                      {user.projectCount > 0 && (
                        <Link to={`/admin/projects?owner=${user.id}`} aria-label={`Projects of ${user.displayName}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <FolderKanban aria-hidden="true" className="h-3.5 w-3.5" />
                          Projects
                        </Link>
                      )}
                      {!user.isSelf && (
                        <Button size="sm" variant="destructive" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setDeleting(user)} aria-label={`Delete ${user.displayName}`}>
                          Delete
                        </Button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-3 flex items-center justify-between text-sm">
              <Button size="sm" disabled={page <= 1} onClick={() => setPageState({ search, page: page - 1 })}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPageState({ search, page: page + 1 })}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}

      <DeleteUserDialog
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(user, result) => {
          users.reload();
          setStatsVersion((value) => value + 1);
          const moved = result.transferredProjects > 0 ? ` ${pluralize(result.transferredProjects, "project")} moved.` : result.deletedProjects > 0 ? ` ${pluralize(result.deletedProjects, "project")} deleted.` : "";
          showToast(`Deleted ${user.displayName}.${moved}`, "success");
        }}
      />
    </main>
  );
}
