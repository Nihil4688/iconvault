// A group of projects on the dashboard, made by hand with Move to Group (for example "BoldDesk" holding "bolddesk-agent" and "bolddesk-customer"), the same size as a project card and drawn as a small stack of cards so it reads as a group. It shows the group's name, the members' short names, sample icons from them and the totals; the whole card opens the group (a stretched link on the name).
import { ChevronRight, Layers } from "lucide-react";
import { Link, type To } from "react-router-dom";
import type { ProjectGroup } from "../../lib/projectGroups";
import { pluralize } from "../../lib/format";
import Badge from "../ui/Badge";
import SvgPreview from "../ui/SvgPreview";
import ProjectAvatar from "./ProjectAvatar";

// A member's name without the group name in front ("agent" for "bolddesk-agent" in "BoldDesk"); any other name is kept as it is.
function shortName(projectName: string, groupName: string): string {
  const rest = projectName.trim().slice(groupName.length).replace(/^[\s\-_./:]+/, "");
  return projectName.trim().toLowerCase().startsWith(groupName.toLowerCase()) && rest ? rest : projectName.trim();
}

export default function ProjectGroupCard({ group, to }: { group: ProjectGroup; to: To }) {
  const iconCount = group.projects.reduce((sum, project) => sum + project.iconCount, 0);
  const sampleIcons = group.projects.flatMap((project) => project.sampleIcons).slice(0, 4);
  const members = group.projects.map((project) => shortName(project.name, group.name)).join(", ");

  return (
    <li className="project-stack relative mb-2 flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 text-card-foreground transition-all duration-200 hover:-translate-y-1 hover:border-primary/60">
      <div className="flex items-start justify-between gap-2.5">
        <Badge className="border-primary/30 bg-primary/10 text-primary" icon={<Layers aria-hidden="true" className="h-3 w-3" />}>
          Group
        </Badge>
        <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>

      <div className="flex items-center gap-2.5">
        <ProjectAvatar name={group.name} color={group.projects[0]?.color ?? "#2563eb"} className="h-7 w-7 rounded-lg text-xs" />
        <h3 title={group.name} className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Link to={to} className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {group.name}
          </Link>
        </h3>
      </div>

      <p className="-mt-1 truncate pr-1 text-xs text-muted-foreground" title={members}>
        {members}
      </p>
      <div className="flex min-h-9 min-w-0 items-center gap-2 overflow-hidden rounded-lg bg-muted px-3 py-2" role="img" aria-label={pluralize(sampleIcons.length, "Sample Icon")}>
        {sampleIcons.length > 0 ? (
          <>
            {sampleIcons.map((icon) => (
              <SvgPreview key={icon.id} svg={icon.svg} size={18} color="currentColor" center className="dark:text-white" />
            ))}
            {iconCount > sampleIcons.length && <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">+{iconCount - sampleIcons.length} more</span>}
          </>
        ) : (
          <p className="w-full text-center text-xs text-muted-foreground">No icons uploaded</p>
        )}
      </div>
      <p className="truncate pt-0.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{pluralize(group.projects.length, "project")}</span> · {pluralize(iconCount, "icon")}
      </p>
    </li>
  );
}
