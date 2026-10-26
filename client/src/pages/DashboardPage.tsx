// The signed-in home screen: every project the user can see, with filters (kept in the address, so Back works and links can be shared), create, edit, duplicate, archive and delete, plus a search that also finds icons across projects and can copy them into one of the user's projects.
import { ChevronDown, Filter, Globe, Layers, Lock, Plus, Search, Shapes, Type } from "lucide-react";
import { useContext, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { searchIcons } from "../api/icons";
import { deleteProject, duplicateProject, importProject, listProjects, updateProject } from "../api/projects";
import type { IconSearchResult, ListProjectsParams, ProjectSummary } from "../api/types";
import CopyToProjectDialog from "../components/projects/CopyToProjectDialog";
import { PurposeBadge } from "../components/projects/ProjectBadges";
import ProjectCard from "../components/projects/ProjectCard";
import ProjectFormDialog from "../components/projects/ProjectFormDialog";
import { Button } from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import SegmentedGroup from "../components/ui/SegmentedGroup";
import SvgPreview from "../components/ui/SvgPreview";
import { HeaderActionsContext } from "../context/headerActionsContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDebounced } from "../hooks/useDebounced";
import { useResource } from "../hooks/useResource";
import { cn } from "../lib/cn";
import { pluralize } from "../lib/format";

const SORT_LABELS = { updated: "Recently updated", created: "Newest", name: "Name", icons: "Most icons" } as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

type FormState = { mode: "create" } | { mode: "edit"; project: ProjectSummary } | null;

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Private / Public are told apart in the page (every project the person can see is loaded once); the old "mine" address value falls back to All.
  const scope = oneOf(params.get("scope"), ["all", "private", "public"], "all");
  const status = oneOf(params.get("status"), ["active", "archived", "all"], "active");
  const purpose = oneOf(params.get("type"), ["all", "sprite", "font"], "all");
  const sort = oneOf(params.get("sort"), ["updated", "created", "name", "icons"], "updated");

  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText.trim(), 300);

  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [copying, setCopying] = useState<IconSearchResult | null>(null);

  const query: ListProjectsParams = { scope: "all", status, sort, limit: 100, ...(search ? { search } : {}) };
  const projects = useResource(`projects:${JSON.stringify(query)}`, () => listProjects(query));
  const iconResults = useResource(search.length >= 2 ? `icons:${search}` : null, () => searchIcons(search, { limit: 24 }));

  function setFilter(name: string, value: string, fallback: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === fallback) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  // Creates a new private project from an export ZIP and says what was left out.
  async function handleImportChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await importProject(file);
      projects.reload();
      const skipped = result.problems.length > 0 ? ` ${pluralize(result.problems.length, "icon")} could not be imported.` : "";
      showToast(`Imported “${result.project.name}” with ${pluralize(result.imported, "icon")}.${skipped}`, result.problems.length > 0 ? "warning" : "success", [{ label: "Open", type: "primary", onClick: () => navigate(`/projects/${result.project.id}`) }]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not import the project.", "error");
    }
  }

  async function handleDuplicate(project: ProjectSummary) {
    try {
      const copy = await duplicateProject(project.id);
      projects.reload();
      showToast(`Created “${copy.name}”.`, "success", [{ label: "Open", type: "primary", onClick: () => navigate(`/projects/${copy.id}`) }]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not duplicate the project.", "error");
    }
  }

  async function handleToggleArchive(project: ProjectSummary) {
    try {
      await updateProject(project.id, { isArchived: !project.isArchived });
      projects.reload();
      showToast(project.isArchived ? `Marked “${project.name}” as active.` : `Marked “${project.name}” as draft.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update the project.", "error");
    }
  }

  const loaded = projects.data?.projects ?? [];
  const byType = loaded.filter((project) => purpose === "all" || project.purpose === purpose);
  const byVisibility = loaded.filter((project) => scope === "all" || project.visibility === scope);
  const renderCards = (items: ProjectSummary[]) => (
    <ul className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", projects.loading && "opacity-60")}>
      {items.map((project) => (
        <ProjectCard key={project.id} project={project} currentUserId={currentUser?.id ?? ""} onEdit={(p) => setForm({ mode: "edit", project: p })} onDuplicate={handleDuplicate} onToggleArchive={handleToggleArchive} onDelete={setDeleting} />
      ))}
    </ul>
  );
  const list = byType.filter((project) => scope === "all" || project.visibility === scope);
  const privateList = list.filter((project) => project.visibility === "private");
  const publicList = list.filter((project) => project.visibility === "public");
  const actionsSlot = useContext(HeaderActionsContext);
  const filtersActive = scope !== "all" || status !== "active" || purpose !== "all" || search !== "";
  const headerButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <input type="file" accept=".zip,application/zip" aria-label="Project export file" className="hidden" onChange={handleImportChosen} />
      <Button variant="primary" className="h-9" icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => setForm({ mode: "create" })}>
        New project
      </Button>
    </div>
  );
  const showIcons = search.length >= 2;

  return (
    <main id="main" tabIndex={-1} className="pt-[57px] outline-none">
      <h1 className="sr-only">Projects</h1>
      {actionsSlot ? createPortal(headerButtons, actionsSlot) : <div className="flex justify-end px-4 pt-3 sm:px-6">{headerButtons}</div>}

      {/* The second-level bar: full width, like the project bar. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="relative w-64 max-w-full">
          <label htmlFor="dashboard-search" className="sr-only">
            Search projects and icons
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="dashboard-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search projects and icons"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </div>

        <SegmentedGroup
          label="Show"
          value={scope}
          onChange={(value) => setFilter("scope", value, "all")}
          options={[
            { value: "all", label: "All", count: byType.length },
            { value: "private", label: "Private", count: byType.filter((project) => project.visibility === "private").length, icon: <Lock aria-hidden="true" className="h-3.5 w-3.5" /> },
            { value: "public", label: "Public", count: byType.filter((project) => project.visibility === "public").length, icon: <Globe aria-hidden="true" className="h-3.5 w-3.5" /> },
          ]}
        />
        <SegmentedGroup
          label="Type"
          value={purpose}
          onChange={(value) => setFilter("type", value, "all")}
          options={[
            { value: "all", label: "All types", count: byVisibility.length, icon: <Layers aria-hidden="true" className="h-3.5 w-3.5" /> },
            { value: "sprite", label: "Sprites", count: byVisibility.filter((project) => project.purpose === "sprite").length, icon: <Shapes aria-hidden="true" className="h-3.5 w-3.5" /> },
            { value: "font", label: "Fonts", count: byVisibility.filter((project) => project.purpose === "font").length, icon: <Type aria-hidden="true" className="h-3.5 w-3.5" /> },
          ]}
        />
        <div className="relative ml-auto">
          <label htmlFor="dashboard-status" className="sr-only">
            Status
          </label>
          <select id="dashboard-status" value={status} onChange={(event) => setFilter("status", event.target.value, "active")} className="h-9 appearance-none rounded-lg border border-input bg-background pl-3 pr-9 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring">
            <option value="active">Active</option>
            <option value="archived">Draft</option>
            <option value="all">Both</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {/* The sort choice is a filter icon; the list of choices opens from it. */}
        <label className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring" title={`Sort: ${SORT_LABELS[sort]}`}>
          <Filter aria-hidden="true" className="h-4 w-4" />
          <select aria-label="Sort by" value={sort} onChange={(event) => setFilter("sort", event.target.value, "updated")} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
            {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="px-4 pb-10 pt-4 sm:px-6">
      {showIcons && (
        <section aria-labelledby="icon-results-title">
          <h2 id="icon-results-title" className="text-lg font-semibold">
            Icons matching “{search}”
          </h2>
          <div role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {iconResults.error ? <span className="text-destructive">{iconResults.error.message}</span> : iconResults.loading && !iconResults.data ? "Searching…" : pluralize(iconResults.data?.total ?? 0, "icon") + " found"}
          </div>
          {(iconResults.data?.icons.length ?? 0) > 0 && (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {iconResults.data?.icons.map((icon) => (
                <li key={icon.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <SvgPreview svg={icon.svg ?? ""} size={36} className="rounded-md bg-muted p-1.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{icon.name}</p>
                    {icon.project && (
                      <div className="flex min-w-0 items-center gap-2">
                        <Link to={`/projects/${icon.project.id}`} className="min-w-0 truncate rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                          {icon.project.name}
                        </Link>
                        <PurposeBadge purpose={icon.project.purpose} />
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setCopying(icon)} aria-label={`Copy ${icon.name} to a project`}>
                    Copy
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="projects-title" className={showIcons ? "mt-8" : ""}>
        {showIcons && (
          <h2 id="projects-title" className="mb-3 text-lg font-semibold">
            Projects
          </h2>
        )}
        {!showIcons && (
          <h2 id="projects-title" className="sr-only">
            Project list
          </h2>
        )}

        {projects.error && !projects.data ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6 text-center">
            <p className="font-medium text-destructive">{projects.error.message}</p>
            <Button className="mt-3" onClick={projects.reload}>
              Try again
            </Button>
          </div>
        ) : projects.loading && !projects.data ? (
          <ul aria-busy="true" aria-label="Loading projects" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <li key={i} className="h-28 animate-pulse rounded-xl border border-border bg-muted" />
            ))}
          </ul>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-base font-semibold">{filtersActive ? "No projects match." : "You have no projects yet."}</p>
            <p className="mt-1 text-sm text-muted-foreground">{filtersActive ? "Try a different search or filter." : "Create a project to start collecting icons."}</p>
            {!filtersActive && (
              <Button variant="primary" className="mt-4" onClick={() => setForm({ mode: "create" })}>
                New project
              </Button>
            )}
          </div>
        ) : (
          <>
            {scope === "all" ? (
              // Private and Public projects each get their own section.
              <div className="space-y-5">
                {[
                  { key: "private", title: "Private", icon: <Lock aria-hidden="true" className="h-4 w-4" />, items: privateList },
                  { key: "public", title: "Public", icon: <Globe aria-hidden="true" className="h-4 w-4" />, items: publicList },
                ]
                  .filter((group) => group.items.length > 0)
                  .map((group) => (
                    <section key={group.key} aria-labelledby={`group-${group.key}`}>
                      <h3 id={`group-${group.key}`} className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.icon}
                        {group.title}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium normal-case tracking-normal">{group.items.length}</span>
                      </h3>
                      {renderCards(group.items)}
                    </section>
                  ))}
              </div>
            ) : (
              renderCards(list)
            )}
            {(projects.data?.total ?? 0) > list.length && <p className="mt-4 text-center text-sm text-muted-foreground">Showing the first {list.length} of {projects.data?.total} projects. Use the search to narrow them down.</p>}
          </>
        )}
      </section>
      </div>

      <ProjectFormDialog
        open={form !== null}
        mode={form?.mode ?? "create"}
        project={form?.mode === "edit" ? form.project : undefined}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          projects.reload();
          showToast(form?.mode === "edit" ? `Saved “${saved.name}”.` : `Created “${saved.name}”.`, "success", form?.mode === "edit" ? undefined : [{ label: "Open", type: "primary", onClick: () => navigate(`/projects/${saved.id}`) }]);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ""}”?`}
        message={`This permanently deletes the project with its ${pluralize(deleting?.iconCount ?? 0, "icon")}, folders and history. This cannot be undone.`}
        confirmLabel="Delete project"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await deleteProject(deleting.id);
          projects.reload();
          showToast(`Deleted “${deleting.name}”.`, "success");
        }}
      />
      <CopyToProjectDialog
        open={copying !== null}
        icon={copying}
        onClose={() => setCopying(null)}
        onCopied={(result, destination) => {
          projects.reload();
          if (result.created.length + result.replaced.length > 0) showToast(`Copied to ${destination}.`, "success");
          else if (result.skipped.length > 0) showToast(`Skipped: ${result.skipped[0]?.reason ?? "already there"}`, "warning");
          else showToast(result.errors[0]?.message ?? "Nothing was copied.", "error");
        }}
      />
    </main>
  );
}
