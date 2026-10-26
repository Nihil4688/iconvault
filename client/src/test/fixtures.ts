// Builders for the server's response shapes, so tests only spell out what matters to them.
import type { FolderWithCount, IconItem, ProjectAccess, ProjectDetail, ProjectSummary } from "../api/types";

export const OWN: ProjectAccess = { canView: true, canCopyFrom: true, canEdit: true, canAddIcons: true, canManage: true };
export const READ_ONLY: ProjectAccess = { canView: true, canCopyFrom: true, canEdit: false, canAddIcons: false, canManage: false };

export const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

let counter = 0;
const next = () => (counter += 1);

export function makeProject(over: Partial<ProjectSummary> = {}): ProjectSummary {
  const n = next();
  return {
    id: `p${n}`,
    name: `Project ${n}`,
    description: "",
    prefix: "icon",
    color: "#2563eb",
    purpose: "sprite",
    visibility: "private",
    isArchived: false,
    uncategorizedName: "",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-18T10:00:00.000Z",
    owner: { id: "u1", displayName: "Ada Lovelace" },
    iconCount: 0,
    sampleIcons: [],
    access: OWN,
    ...over,
  };
}

export function makeDetail(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return { ...makeProject(), folderCount: 0, trashCount: 0, ...over };
}

export function makeIcon(over: Partial<IconItem> = {}): IconItem {
  const n = next();
  return {
    id: `i${n}`,
    projectId: "p1",
    folderId: null,
    name: `Icon ${n}`,
    slug: `icon-${n}`,
    tags: [],
    byteSize: 120,
    originalByteSize: 200,
    codepoint: null,
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    hasStroke: false,
    hasGradient: false,
    hasText: false,
    deletedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-18T10:00:00.000Z",
    svg: SVG_A,
    ...over,
  };
}

export function makeFolder(over: Partial<FolderWithCount> = {}): FolderWithCount {
  const n = next();
  return { id: `f${n}`, projectId: "p1", parentId: null, name: `Folder ${n}`, orderIndex: 0, iconCount: 0, ...over };
}
