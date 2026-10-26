// Manage Projects (admins only): every project in the workspace, private and draft ones too, with its owner, a search that also matches the owner's name or email, an optional owner filter (from the Users screen), and per project Open, Transfer ownership and Delete. Tick several projects to transfer or delete them together. Anyone else is sent to the dashboard.
import { ExternalLink, Trash2, UserCog, X } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { bulkDeleteProjects } from "../api/admin";
import { deleteProject, listProjects } from "../api/projects";
import type { ProjectSummary } from "../api/types";
import { ProjectStatCards } from "../components/admin/AdminStats";
import { useAdminStats } from "../hooks/useAdminStats";
import AdminCrumb from "../components/admin/AdminCrumb";
import AdminTabs from "../components/admin/AdminTabs";
import BulkTransferDialog from "../components/admin/BulkTransferDialog";
import TransferProjectDialog from "../components/admin/TransferProjectDialog";
import { PurposeBadge, VisibilityBadge } from "../components/projects/ProjectBadges";
import Badge from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDebounced } from "../hooks/useDebounced";
import { useResource } from "../hooks/useResource";
import { formatRelative, pluralize } from "../lib/format";

const PAGE_SIZE = 25;

export default function AdminProjectsPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText.trim(), 300);
  const [pageState, setPageState] = useState({ search: "", page: 1 });
  const page = pageState.search === search ? pageState.page : 1;
  const [transferring, setTransferring] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [urlParams, setUrlParams] = useSearchParams();
  const owner = urlParams.get("owner") ?? "";
  const [statsVersion, setStatsVersion] = useState(0);
  const [bulkTransferring, setBulkTransferring] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const stats = useAdminStats(statsVersion);
  const listKey = `${owner}|${search}|${page}`;
  // Ticked projects only count for the list they were ticked in.
  const [ticked, setTicked] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const tickedIds = ticked.key === listKey ? ticked.ids : [];
  const isAdmin = currentUser?.role === "admin";
  const projects = useResource(isAdmin ? `admin-projects:${owner}:${search}:${page}` : null, () => listProjects({ status: "all", scope: "all", sort: "updated", ...(owner ? { owner } : {}), ...(search ? { search } : {}), page, limit: PAGE_SIZE }));
  const afterChange = () => {
    projects.reload();
    setStatsVersion((value) => value + 1);
    setTicked({ key: listKey, ids: [] });
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const rows = projects.data?.projects ?? [];
  const pickedProjects = rows.filter((project) => tickedIds.includes(project.id));
  const allTicked = rows.length > 0 && pickedProjects.length === rows.length;
  const toggle = (id: string) => setTicked({ key: listKey, ids: tickedIds.includes(id) ? tickedIds.filter((x) => x !== id) : [...tickedIds, id] });
  const total = projects.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-[calc(57px+2rem)] outline-none">
      <AdminCrumb page="Manage projects" />
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Manage projects</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Every project in the workspace, including private and draft ones. Move a project to another owner or delete it for good.</p>
      <AdminTabs />
      <ProjectStatCards stats={stats} />

      <div className="mt-6">
        <label htmlFor="admin-project-search" className="sr-only">
          Search projects
        </label>
        <input id="admin-project-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search by project, prefix, owner name or email" autoComplete="off" className="h-9 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring" />
      </div>

      {owner && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm">
          Owner: <span className="font-semibold">{rows[0]?.owner.displayName ?? "this user"}</span>
          <button type="button" aria-label="Show every owner's projects" onClick={() => setUrlParams({}, { replace: true })} className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </p>
      )}

      {pickedProjects.length > 0 && (
        <div role="region" aria-label="Selected projects" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="mr-auto text-sm font-medium">{pluralize(pickedProjects.length, "project")} selected</p>
          <Button size="sm" icon={<UserCog aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setBulkTransferring(true)}>
            Transfer selected
          </Button>
          <Button size="sm" variant="destructive" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setBulkDeleting(true)}>
            Delete selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTicked({ key: listKey, ids: [] })}>
            Clear
          </Button>
        </div>
      )}

      {projects.error && !projects.data ? (
        <div role="alert" className="mt-4 rounded-xl border border-destructive/40 p-6 text-center">
          <p className="font-medium text-destructive">{projects.error.message}</p>
          <Button className="mt-3" onClick={projects.reload}>
            Try again
          </Button>
        </div>
      ) : !projects.data ? (
        <div aria-busy="true" aria-label="Loading projects" className="mt-4 h-48 animate-pulse rounded-xl bg-muted" />
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{search ? `No projects match “${search}”.` : "There are no projects."}</p>
      ) : (
        <>
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {pluralize(total, "project")}
          </p>
          <div className={`relative mt-2 overflow-x-auto rounded-xl border border-border ${projects.loading ? "opacity-60" : ""}`}>
            <table className="w-full min-w-3xl text-left text-sm">
              <caption className="sr-only">Projects</caption>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Select all projects on this page" checked={allTicked} onChange={(event) => setTicked({ key: listKey, ids: event.target.checked ? rows.map((project) => project.id) : [] })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">Project</th>
                  <th scope="col" className="px-3 py-2 font-medium">Owner</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Icons</th>
                  <th scope="col" className="px-3 py-2 font-medium">Updated</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((project) => (
                  <tr key={project.id} className={tickedIds.includes(project.id) ? "bg-primary/5" : undefined}>
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`Select ${project.name}`} checked={tickedIds.includes(project.id)} onChange={() => toggle(project.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{project.name}</span>
                        <VisibilityBadge visibility={project.visibility} />
                        <PurposeBadge purpose={project.purpose} />
                        {project.isArchived && <Badge>Draft</Badge>}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{project.prefix}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{project.owner.displayName}</span>
                      {project.owner.email && <span className="block text-xs text-muted-foreground">{project.owner.email}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{project.iconCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatRelative(project.updatedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link to={`/projects/${project.id}`} aria-label={`Open ${project.name}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                          Open
                        </Link>
                        <Button size="sm" icon={<UserCog aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setTransferring(project)} aria-label={`Transfer ${project.name}`}>
                          Transfer
                        </Button>
                        <Button size="sm" variant="destructive" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setDeleting(project)} aria-label={`Delete ${project.name}`}>
                          Delete
                        </Button>
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

      {transferring && (
        <TransferProjectDialog
          open
          project={{ ...transferring, folderCount: 0, trashCount: 0 }}
          onClose={() => setTransferring(null)}
          onTransferred={(updated) => {
            afterChange();
            showToast(`Moved “${updated.name}” to ${updated.owner.displayName}.`, "success");
          }}
        />
      )}
      <BulkTransferDialog
        open={bulkTransferring}
        projects={pickedProjects}
        onClose={() => setBulkTransferring(false)}
        onDone={(result, ownerName) => {
          afterChange();
          const failed = result.failed.length;
          showToast(failed > 0 ? `Moved ${pluralize(result.done, "project")} to ${ownerName}; ${failed} could not move (${result.failed[0]?.message}).` : `Moved ${pluralize(result.done, "project")} to ${ownerName}.`, failed > 0 ? "warning" : "success");
        }}
      />
      <ConfirmDialog
        open={bulkDeleting}
        title={`Delete ${pluralize(pickedProjects.length, "project")}?`}
        message={`This permanently deletes ${pickedProjects.slice(0, 4).map((project) => `“${project.name}”`).join(", ")}${pickedProjects.length > 4 ? ` and ${pickedProjects.length - 4} more` : ""} with their icons, folders and history. This cannot be undone.`}
        confirmLabel="Delete projects"
        destructive
        onClose={() => setBulkDeleting(false)}
        onConfirm={async () => {
          const result = await bulkDeleteProjects(pickedProjects.map((project) => project.id));
          afterChange();
          showToast(`Deleted ${pluralize(result.done, "project")}${result.failed.length > 0 ? `; ${result.failed.length} could not be deleted` : ""}.`, result.failed.length > 0 ? "warning" : "success");
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ""}”?`}
        message={`This permanently deletes the project with its ${pluralize(deleting?.iconCount ?? 0, "icon")}, folders and history. It belongs to ${deleting?.owner.displayName ?? "its owner"}. This cannot be undone.`}
        confirmLabel="Delete project"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteProject(deleting.id);
          afterChange();
          showToast(`Deleted “${deleting.name}”.`, "success");
        }}
      />
    </main>
  );
}
