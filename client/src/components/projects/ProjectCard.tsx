// One project on the dashboard, kept small so many fit on a screen: a small accent avatar with the name and the actions menu, a one line description (cut off with an ellipsis), the coloured badges (above the title), a row of small sample icons (18 px) of its own in a roomy grey box, and who created it. The whole card opens the project (a stretched link on the name), and the menu sits above it.
import { Archive, ArchiveRestore, Copy, Globe, Lock, Pencil, Share2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectSummary } from "../../api/types";
import aiIconUrl from "../../assets/ai-icon.svg";
import { useAuth } from "../../context/AuthContext";
import { pluralize } from "../../lib/format";
import ActionMenu, { type MenuAction } from "../ui/ActionMenu";
import Badge from "../ui/Badge";
import HighlightText from "../ui/HighlightText";
import SvgPreview from "../ui/SvgPreview";
import ProjectAvatar from "./ProjectAvatar";
import { PurposeBadge } from "./ProjectBadges";

export type ProjectCardActions = {
  onEdit: (project: ProjectSummary) => void;
  onDuplicate: (project: ProjectSummary) => void;
  onShare: (project: ProjectSummary) => void;
  onToggleArchive: (project: ProjectSummary) => void;
  onToggleVisibility: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

// `highlight` marks the search text in the project name.
type ProjectCardProps = ProjectCardActions & { project: ProjectSummary; currentUserId: string; highlight?: string };

export default function ProjectCard({ project, currentUserId, highlight, onEdit, onDuplicate, onShare, onToggleArchive, onToggleVisibility, onDelete }: ProjectCardProps) {
  const { currentUser } = useAuth();
  const mine = project.owner.id === currentUserId;
  const showCreator = project.visibility === "public" || currentUser?.role === "admin";
  const actions: MenuAction[] = [
    { label: "Duplicate", icon: <Copy aria-hidden="true" className="h-4 w-4" />, onSelect: () => onDuplicate(project) },
  ];
  // Only active public projects can be opened by others, so only they can be shared.
  if (project.visibility === "public" && !project.isArchived) {
    actions.push({ label: "Share Project", icon: <Share2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => onShare(project) });
  }
  // The owner manages their own projects; admins manage everyone's, so they get this on every card.
  if (project.access.canManage) {
    actions.unshift({ label: "Edit Details", icon: <Pencil aria-hidden="true" className="h-4 w-4" />, onSelect: () => onEdit(project) });
    // A draft's visibility is changed once it is active again.
    if (!project.isArchived) {
      actions.push(
        project.visibility === "public"
          ? { label: "Make Private", icon: <Lock aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleVisibility(project) }
          : { label: "Make Public", icon: <Globe aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleVisibility(project) },
      );
    }
    actions.push(
      project.isArchived
        ? { label: "Mark as Active", icon: <ArchiveRestore aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleArchive(project) }
        : { label: "Mark as Draft", icon: <Archive aria-hidden="true" className="h-4 w-4" />, onSelect: () => onToggleArchive(project) },
      { label: "Delete", icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, onSelect: () => onDelete(project), destructive: true },
    );
  }

  return (
    <li className="relative flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-sm hover:border-primary/60 transition-all duration-200 hover:shadow-xl hover:-translate-y-1">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PurposeBadge purpose={project.purpose} />
          {project.createdVia === "mcp" && (
            <span role="img" aria-label="Created with MCP" title="Created with MCP">
              <img src={aiIconUrl} alt="" aria-hidden="true" className="h-4 w-4" />
            </span>
          )}
          {project.isArchived && <Badge icon={<Archive aria-hidden="true" className="h-3 w-3" />}>Draft</Badge>}
        </div>
        <ActionMenu label={`Actions for ${project.name}`} actions={actions} className="relative z-10 shrink-0" />
      </div>

      <div className="flex items-center gap-2.5">
        <ProjectAvatar name={project.name} color={project.color} className="h-7 w-7 rounded-lg text-xs" />
        <h3 title={project.name} className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Link to={`/projects/${project.id}`} className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <HighlightText text={project.name} query={highlight} />
          </Link>
        </h3>
      </div>

      <p className="-mt-1 truncate pr-1 text-xs text-muted-foreground" title={project.description || undefined}>
        {project.description || "No description."}
      </p>
      <div
        className="flex min-h-9 min-w-0 items-center gap-2 overflow-hidden rounded-lg bg-muted px-3 py-2"
        role="img"
        aria-label={pluralize(project.sampleIcons.length, "Sample Icon")}
      >
        {project.sampleIcons.length > 0 ? (
          <>
            {project.sampleIcons.slice(0, 4).map((icon) => (
              <SvgPreview key={icon.id} svg={icon.svg} size={18} color="currentColor" center className="dark:text-white"/>
            ))}
            {project.iconCount > 4 && (
              <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                +{project.iconCount - 4} more
              </span>
            )}
          </>
        ) : (
          <p className="w-full text-xs text-center text-muted-foreground">
            No icons uploaded
          </p>
        )}
      </div>
      {showCreator && (
        <p className="truncate pt-0.5 text-[11px] text-muted-foreground">
          Created by <span className="font-medium text-foreground">{mine ? "You" : project.owner.displayName}</span>
        </p>
      )}
    </li>
  );
}
