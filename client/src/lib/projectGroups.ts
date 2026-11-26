// Groups dashboard projects by the group their owner put them in by hand (the project's `group` field, for example "BoldDesk"). Group names are compared without case or extra spaces, so "BoldDesk" and "bolddesk " are one group. Projects in no group stay on their own.
import type { ProjectSummary } from "../api/types";

export type ProjectGroup = { key: string; name: string; projects: ProjectSummary[] };
export type ProjectTile = { kind: "project"; project: ProjectSummary } | { kind: "group"; group: ProjectGroup };

// The key used in the address and to compare names; empty for no group.
export function groupKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// The projects in one group, in their original order.
export function projectsInGroup(projects: ProjectSummary[], key: string): ProjectSummary[] {
  return projects.filter((project) => groupKey(project.group) === key);
}

// Every group name in use, spelled as its first project spells it, sorted by name. Offered as suggestions when choosing a group.
export function groupNames(projects: ProjectSummary[]): string[] {
  const names = new Map<string, string>();
  for (const project of projects) {
    const key = groupKey(project.group);
    if (key && !names.has(key)) names.set(key, project.group.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

// One tile per project, except that the projects of a group become one group tile in the place of its first project, so the chosen sort order is kept.
export function groupProjects(projects: ProjectSummary[]): ProjectTile[] {
  const members = new Map<string, ProjectSummary[]>();
  for (const project of projects) {
    const key = groupKey(project.group);
    if (key) members.set(key, [...(members.get(key) ?? []), project]);
  }

  const tiles: ProjectTile[] = [];
  for (const project of projects) {
    const key = groupKey(project.group);
    const group = members.get(key);
    if (!key || !group) tiles.push({ kind: "project", project });
    else if (group[0] === project) tiles.push({ kind: "group", group: { key, name: project.group.trim(), projects: group } });
  }
  return tiles;
}
