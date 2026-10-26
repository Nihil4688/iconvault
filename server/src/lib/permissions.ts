// Who may do what with a project. Pure functions: pass the signed-in actor (or null) and the project, get a yes/no. Sign-in is required for everything, so a missing actor is always denied.
//
// Rules (public bundles stay read-only for others, as in the original Compiler):
//   admin            everything, on every project
//   owner            everything, on their own projects
//   other user       public project: view it and copy icons out of it; private project: nothing
//   not signed in    nothing

export type Actor = { id: string; isAdmin: boolean } | null | undefined;

export type ProjectAccessInfo = {
  ownerId: unknown;
  visibility: "public" | "private";
};

export type AccessFlags = {
  canView: boolean;
  canCopyFrom: boolean;
  canEdit: boolean;
  canAddIcons: boolean;
  canManage: boolean;
};

function isOwner(actor: NonNullable<Actor>, project: ProjectAccessInfo): boolean {
  return project.ownerId != null && String(project.ownerId) === String(actor.id);
}

// Open the project, list its folders and icons, preview and download.
export function canView(actor: Actor, project: ProjectAccessInfo | null | undefined): boolean {
  if (!actor || !project) return false;
  if (actor.isAdmin || isOwner(actor, project)) return true;
  return project.visibility === "public";
}

// Copy icons from this project into another one the actor can write to.
export function canCopyFrom(actor: Actor, project: ProjectAccessInfo | null | undefined): boolean {
  return canView(actor, project);
}

// Change the project's content: add, edit, move and delete icons and folders, build and delete builds.
export function canEdit(actor: Actor, project: ProjectAccessInfo | null | undefined): boolean {
  if (!actor || !project) return false;
  return actor.isAdmin || isOwner(actor, project);
}

// Change the project itself: rename, visibility, archive, delete, transfer.
export function canManage(actor: Actor, project: ProjectAccessInfo | null | undefined): boolean {
  if (!actor || !project) return false;
  return actor.isAdmin || isOwner(actor, project);
}

// Everything the interface needs to decide which controls to show. Adding icons needs the same right as editing.
export function describeAccess(actor: Actor, project: ProjectAccessInfo | null | undefined): AccessFlags {
  const edit = canEdit(actor, project);
  return {
    canView: canView(actor, project),
    canCopyFrom: canCopyFrom(actor, project),
    canEdit: edit,
    canAddIcons: edit,
    canManage: canManage(actor, project),
  };
}
