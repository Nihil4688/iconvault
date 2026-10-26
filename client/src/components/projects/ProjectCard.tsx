// One project on the dashboard, kept small so many fit on a screen: a small accent avatar with the name and the actions menu, a one line description (cut off with an ellipsis), the coloured badges (above the title), a row of small sample icons (18 px) of its own in a roomy grey box, and who created it. The whole card opens the project (a stretched link on the name), and the menu sits above it.
import { Archive, ArchiveRestore, Copy, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectSummary } from "../../api/types";
import { pluralize } from "../../lib/format";
import ActionMenu, { type MenuAction } from "../ui/ActionMenu";
import Badge from "../ui/Badge";
import SvgPreview from "../ui/SvgPreview";
import ProjectAvatar from "./ProjectAvatar";
import { PurposeBadge, VisibilityBadge } from "./ProjectBadges";

export type ProjectCardActions = {
  onEdit: (project: ProjectSummary) => void;
  onDuplicate: (project: ProjectSummary) => void;
  onToggleArchive: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

type ProjectCardProps = ProjectCardActions & { project: ProjectSummary; currentUserId: string };

export default function ProjectCard({ project, currentUserId, onEdit, onDuplicate, onToggleArchive, onDelete }: ProjectCardProps) {
  const mine = project.owner.id === currentUserId;
  const actions: MenuAction[] = [
    { label: "Duplicate", icon: <Copy aria-hidden="true" className="h-4 w-4" />, onSelect: () => onDuplicate(project) },
  ];
  if (project.access.canManage) {
    actions.unshift({ label: "Edit details", icon: <Pencil aria-hidden="true" className="h-4 w-4" />, onSelect: () => onEdit(project) });
    actions.push(
      project.isArchived
        ? { label: "Mark as active", icon: <ArchiveRestore aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleArchive(project) }
        : { label: "Mark as draft", icon: <Archive aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleArchive(project) },
      { label: "Delete", icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => onDelete(project), destructive: true },
    );
  }

  return (
    <li className="relative flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="flex flex-wrap items-center gap-1.5">
        <VisibilityBadge visibility={project.visibility} />
        <PurposeBadge purpose={project.purpose} />
        {project.isArchived && <Badge icon={<Archive aria-hidden="true" className="h-3 w-3" />}>Draft</Badge>}
      </div>

      <div className="flex items-center gap-2.5">
        <ProjectAvatar name={project.name} color={project.color} className="h-7 w-7 rounded-lg text-xs" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Link to={`/projects/${project.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {project.name}
          </Link>
        </h3>
        <ActionMenu label={`Actions for ${project.name}`} actions={actions} className="relative z-10 -mr-1" />
      </div>

      <p className="-mt-1 truncate pr-1 text-xs text-muted-foreground" title={project.description || undefined}>
        {project.description || "No description."}
      </p>

      {project.sampleIcons.length > 0 && (
        <div className="flex min-h-9 items-center gap-3 overflow-hidden rounded-lg bg-muted px-3 py-2" role="img" aria-label={`${pluralize(project.sampleIcons.length, "sample icon")}`}>
          {project.sampleIcons.slice(0, 6).map((icon) => (
            <SvgPreview key={icon.id} svg={icon.svg} size={18} />
          ))}
        </div>
      )}

      <p className="truncate pt-0.5 text-[11px] text-muted-foreground">
        Created by <span className="font-medium text-foreground">{mine ? "You" : project.owner.displayName}</span>
      </p>
    </li>
  );
}
