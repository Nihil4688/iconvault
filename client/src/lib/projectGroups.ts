// Groups dashboard projects into families by the start of their name: "bolddesk-agent", "BoldDesk_Customer" and "bolddesk.email-template" all belong to "bolddesk", and a project named just "BoldDesk" joins them. Only hyphens, underscores, dots, slashes and colons separate the family from the rest, so ordinary names with spaces ("My Icons", "My Logos") never group. A family needs two or more projects; every other project stays on its own.
import type { ProjectSummary } from "../api/types";

export type ProjectGroup = { key: string; name: string; projects: ProjectSummary[] };
export type ProjectTile = { kind: "project"; project: ProjectSummary } | { kind: "group"; group: ProjectGroup };

const SEPARATOR = /\s*[-_./:]+\s*/;

// The family part of a name as written ("BoldDesk" for "BoldDesk-Agent"), or null when the name has no separator.
function familyName(name: string): string | null {
  const [first, ...rest] = name.trim().split(SEPARATOR);
  return first && rest.some(Boolean) ? first : null;
}

// The family a project belongs to among `projects`, compared without case; null when it has none.
function familyKeys(projects: ProjectSummary[]): Map<string, string> {
  const families = new Set(projects.map((project) => familyName(project.name)?.toLowerCase()).filter((key): key is string => Boolean(key)));
  const keys = new Map<string, string>();
  for (const project of projects) {
    const key = familyName(project.name)?.toLowerCase() ?? project.name.trim().toLowerCase();
    if (families.has(key)) keys.set(project.id, key);
  }
  return keys;
}

// The projects of one family, in their original order. Used to open a group, so it also works when only one member is left.
export function projectsInGroup(projects: ProjectSummary[], key: string): ProjectSummary[] {
  const keys = familyKeys(projects);
  return projects.filter((project) => keys.get(project.id) === key);
}

// The group's display name: the project named exactly after the family when there is one, otherwise the family part of the first name.
export function groupDisplayName(members: ProjectSummary[], key: string): string {
  const exact = members.find((project) => project.name.trim().toLowerCase() === key);
  return exact?.name.trim() ?? (members[0] ? familyName(members[0].name) : null) ?? key;
}

// One tile per project, except that a family of two or more becomes one group tile in the place of its first member, so the chosen sort order is kept.
export function groupProjects(projects: ProjectSummary[]): ProjectTile[] {
  const keys = familyKeys(projects);
  const members = new Map<string, ProjectSummary[]>();
  for (const project of projects) {
    const key = keys.get(project.id);
    if (key) members.set(key, [...(members.get(key) ?? []), project]);
  }

  const tiles: ProjectTile[] = [];
  const placed = new Set<string>();
  for (const project of projects) {
    const key = keys.get(project.id);
    const group = key ? members.get(key) : undefined;
    if (!key || !group || group.length < 2) tiles.push({ kind: "project", project });
    else if (!placed.has(key)) {
      placed.add(key);
      tiles.push({ kind: "group", group: { key, name: groupDisplayName(group, key), projects: group } });
    }
  }
  return tiles;
}
