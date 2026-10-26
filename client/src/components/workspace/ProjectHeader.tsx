// Top of a project, in one bar: where you are (a Dashboard / project breadcrumb, placed in the top bar), the project's name with its type and visibility (each in its own colour), the sections as a pill menu (Icons, Icon Font or Sprite, Settings, Trash), and a slot on the right where the Icons screen places Upload icons and From Another Project. Under the bar: an Archived badge when it is archived, and a note when it is read-only for you.
import { Archive, Settings, Trash2, Type, Layers, Shapes } from "lucide-react";
import { useContext } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import type { ProjectDetail } from "../../api/types";
import { HeaderSlotContext } from "../../context/headerSlotContext";
import { cn } from "../../lib/cn";
import Badge from "../ui/Badge";
import ProjectAvatar from "../projects/ProjectAvatar";
import { PurposeBadge, VisibilityBadge } from "../projects/ProjectBadges";

const pillClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-7 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    isActive ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
  );

const countClass = "rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground";

export default function ProjectHeader({ project, actionsRef }: { project: ProjectDetail; actionsRef?: (node: HTMLDivElement | null) => void }) {
  const isFont = project.purpose === "font";
  const crumbSlot = useContext(HeaderSlotContext);
  // The breadcrumb lives in the top bar; without one (no bar around this screen) it is shown here.
  const breadcrumb = (
      <nav aria-label="Breadcrumb" className="flex min-w-0 justify-center">
        <ol className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-1.5 text-sm">
          <li className="hidden sm:block">
            <Link to="/" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Dashboard
            </Link>
          </li>
          <li aria-hidden="true" className="hidden text-muted-foreground sm:block">
            /
          </li>
          <li aria-current="page" className="min-w-0 truncate font-semibold">
            {project.name}
          </li>
        </ol>
      </nav>
  );

  return (
    <header className="border-b border-border bg-background">
      {crumbSlot ? createPortal(breadcrumb, crumbSlot) : <div className="px-4 pt-3 sm:px-6">{breadcrumb}</div>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3  py-3 px-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectAvatar name={project.name} color={project.color} />
          <h1 title={project.name} className="min-w-0 truncate text-base font-bold leading-6 tracking-tight">{project.name}</h1>
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
            <VisibilityBadge visibility={project.visibility} />
            <PurposeBadge purpose={project.purpose} long />
          </div>
        </div>

        <nav aria-label="Project sections" className="flex min-h-9 flex-wrap items-center justify-center gap-1 justify-self-center rounded-xl border border-border bg-muted p-0.5">
          {/* Absolute paths: relative links would resolve against the current section. */}
          <NavLink to={`/projects/${project.id}`} end className={pillClass}>
            <Layers aria-hidden="true" className="h-4 w-4" />
            Icons
            <span className={countClass}>{project.iconCount}</span>
          </NavLink>
          <NavLink to={`/projects/${project.id}/${isFont ? "font" : "sprite"}`} className={pillClass}>
            {isFont ? <Type aria-hidden="true" className="h-4 w-4" /> : <Shapes aria-hidden="true" className="h-4 w-4" />}
            {isFont ? "Font Builder" : "Sprite Builder"}
          </NavLink>
          <NavLink to={`/projects/${project.id}/trash`} className={pillClass}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Trash
          </NavLink>
          <NavLink to={`/projects/${project.id}/settings`} className={pillClass}>
            <Settings aria-hidden="true" className="h-4 w-4" />
            Project Settings
          </NavLink>
        </nav>

        <div ref={actionsRef} className="ml-auto flex flex-wrap items-center justify-end gap-2 empty:hidden lg:ml-0" />
      </div>

      {project.isArchived && (
        <div className="px-4 pb-3 sm:px-6">
          <Badge icon={<Archive aria-hidden="true" className="h-3 w-3" />}>Draft</Badge>
        </div>
      )}

      {!project.access.canEdit && (
        <p role="note" className="mx-4 mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground sm:mx-6">
          You are viewing this project. Only its owner can change it, but you can download icons or copy them into your own projects.
        </p>
      )}
    </header>
  );
}
