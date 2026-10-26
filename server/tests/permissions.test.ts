// Unit tests for the project permission rules: every kind of actor against every kind of project.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCopyFrom,
  canEdit,
  canManage,
  canView,
  describeAccess,
  type Actor,
  type ProjectAccessInfo,
} from "../src/lib/permissions.js";

const OWNER_ID = "64b7f0c2a1b2c3d4e5f60001";
const OTHER_ID = "64b7f0c2a1b2c3d4e5f60002";
const ADMIN_ID = "64b7f0c2a1b2c3d4e5f60003";

const actors: Record<string, Actor> = {
  guest: null,
  owner: { id: OWNER_ID, isAdmin: false },
  other: { id: OTHER_ID, isAdmin: false },
  admin: { id: ADMIN_ID, isAdmin: true },
};

const projects: Record<string, ProjectAccessInfo> = {
  public: { ownerId: OWNER_ID, visibility: "public" },
  private: { ownerId: OWNER_ID, visibility: "private" },
};

// Expected rights: [view, copyFrom, edit, manage]
const matrix: Array<[string, string, [boolean, boolean, boolean, boolean]]> = [
  ["guest", "public", [false, false, false, false]],
  ["guest", "private", [false, false, false, false]],
  ["owner", "public", [true, true, true, true]],
  ["owner", "private", [true, true, true, true]],
  ["other", "public", [true, true, false, false]],
  ["other", "private", [false, false, false, false]],
  ["admin", "public", [true, true, true, true]],
  ["admin", "private", [true, true, true, true]],
];

describe("project permissions", () => {
  for (const [who, kind, [view, copy, edit, manage]] of matrix) {
    it(`${who} on a ${kind} project`, () => {
      const actor = actors[who];
      const project = projects[kind] as ProjectAccessInfo;
      assert.equal(canView(actor, project), view, "view");
      assert.equal(canCopyFrom(actor, project), copy, "copy from");
      assert.equal(canEdit(actor, project), edit, "edit");
      assert.equal(canManage(actor, project), manage, "manage");
    });
  }

  it("denies everything when the project does not exist", () => {
    for (const actor of Object.values(actors)) {
      assert.equal(canView(actor, null), false);
      assert.equal(canEdit(actor, undefined), false);
      assert.equal(canManage(actor, null), false);
    }
  });

  it("matches the owner by id even when the id is an object", () => {
    const objectLike = { toString: () => OWNER_ID };
    assert.equal(canEdit(actors.owner, { ownerId: objectLike, visibility: "private" }), true);
    assert.equal(canEdit(actors.other, { ownerId: objectLike, visibility: "private" }), false);
  });

  it("never treats a missing owner as a match", () => {
    assert.equal(canEdit(actors.other, { ownerId: null, visibility: "private" }), false);
    assert.equal(canEdit({ id: "null", isAdmin: false }, { ownerId: null, visibility: "private" }), false);
  });

  it("describeAccess gives the flags the interface needs", () => {
    assert.deepEqual(describeAccess(actors.other, projects.public), {
      canView: true,
      canCopyFrom: true,
      canEdit: false,
      canAddIcons: false,
      canManage: false,
    });
    assert.deepEqual(describeAccess(actors.owner, projects.private), {
      canView: true,
      canCopyFrom: true,
      canEdit: true,
      canAddIcons: true,
      canManage: true,
    });
    assert.equal(describeAccess(null, projects.public).canView, false);
  });
});
