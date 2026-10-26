// Unit tests for the request schemas: accepted input, defaults, and the inputs that must be refused.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  batchDeleteSchema,
  batchMoveSchema,
  batchTagSchema,
  createFolderSchema,
  createProjectSchema,
  moveFolderSchema,
  objectId,
  updateIconSchema,
  updateProjectSchema,
} from "../src/lib/validation.js";

const ID = "64b7f0c2a1b2c3d4e5f60001";
const ID2 = "64b7f0c2a1b2c3d4e5f60002";

describe("createProjectSchema", () => {
  it("fills defaults", () => {
    assert.deepEqual(createProjectSchema.parse({ name: "  Feather " }), {
      name: "Feather",
      description: "",
      prefix: "icon",
      color: "#3b82f6",
      purpose: "sprite",
      visibility: "private",
    });
  });

  it("normalizes the prefix", () => {
    assert.equal(createProjectSchema.parse({ name: "x", prefix: " FEATHER_2 " }).prefix, "feather_2");
  });

  it("refuses bad input", () => {
    assert.throws(() => createProjectSchema.parse({}));
    assert.throws(() => createProjectSchema.parse({ name: "   " }));
    assert.throws(() => createProjectSchema.parse({ name: "x".repeat(101) }));
    assert.throws(() => createProjectSchema.parse({ name: "x", color: "blue" }));
    assert.throws(() => createProjectSchema.parse({ name: "x", prefix: "has space" }));
    assert.throws(() => createProjectSchema.parse({ name: "x", purpose: "video" }));
    assert.throws(() => createProjectSchema.parse({ name: "x", visibility: "team" }));
  });

  it("rejects unknown keys such as an owner id", () => {
    assert.throws(() => createProjectSchema.parse({ name: "x", ownerId: ID }));
  });
});

describe("updateProjectSchema", () => {
  it("accepts a partial change", () => {
    assert.deepEqual(updateProjectSchema.parse({ visibility: "public" }), { visibility: "public" });
    assert.deepEqual(updateProjectSchema.parse({ isArchived: true, name: " New " }), { isArchived: true, name: "New" });
  });

  it("refuses an empty change and changing the purpose", () => {
    assert.throws(() => updateProjectSchema.parse({}));
    assert.throws(() => updateProjectSchema.parse({ purpose: "font" }));
    assert.throws(() => updateProjectSchema.parse({ ownerId: ID }));
  });
});

describe("folders", () => {
  it("creates at the root or under a parent", () => {
    assert.deepEqual(createFolderSchema.parse({ name: "UI" }), { name: "UI", parentId: null });
    assert.equal(createFolderSchema.parse({ name: "UI", parentId: ID }).parentId, ID);
  });

  it("refuses a bad parent id and an empty name", () => {
    assert.throws(() => createFolderSchema.parse({ name: "UI", parentId: "nope" }));
    assert.throws(() => createFolderSchema.parse({ name: "" }));
  });

  it("moves to the root with null and refuses a negative position", () => {
    assert.deepEqual(moveFolderSchema.parse({ parentId: null }), { parentId: null });
    assert.throws(() => moveFolderSchema.parse({ parentId: ID, orderIndex: -1 }));
    assert.throws(() => moveFolderSchema.parse({}));
  });
});

describe("updateIconSchema", () => {
  it("lower-cases tags and upper-cases the codepoint", () => {
    const parsed = updateIconSchema.parse({ tags: [" Arrow ", "UI"], codepoint: "e00a" });
    assert.deepEqual(parsed.tags, ["arrow", "ui"]);
    assert.equal(parsed.codepoint, "E00A");
  });

  it("allows clearing the codepoint and moving to the root", () => {
    assert.deepEqual(updateIconSchema.parse({ codepoint: null, folderId: null }), { codepoint: null, folderId: null });
  });

  it("refuses bad input", () => {
    assert.throws(() => updateIconSchema.parse({}));
    assert.throws(() => updateIconSchema.parse({ codepoint: "XYZ1" }));
    assert.throws(() => updateIconSchema.parse({ codepoint: "E0" }));
    assert.throws(() => updateIconSchema.parse({ folderId: "root" }));
    assert.throws(() => updateIconSchema.parse({ rawSvg: "" }));
    assert.throws(() => updateIconSchema.parse({ tags: Array.from({ length: 51 }, (_, i) => `t${i}`) }));
    assert.throws(() => updateIconSchema.parse({ projectId: ID }));
  });
});

describe("batch schemas", () => {
  it("accept a list of ids", () => {
    assert.deepEqual(batchMoveSchema.parse({ iconIds: [ID, ID2], folderId: null }).iconIds, [ID, ID2]);
    assert.equal(batchTagSchema.parse({ iconIds: [ID], tags: ["A"] }).mode, "add");
    assert.equal(batchDeleteSchema.parse({ iconIds: [ID] }).permanent, false);
  });

  it("refuse empty, oversized and malformed lists", () => {
    assert.throws(() => batchMoveSchema.parse({ iconIds: [], folderId: null }));
    assert.throws(() => batchMoveSchema.parse({ iconIds: ["x"], folderId: null }));
    assert.throws(() => batchDeleteSchema.parse({ iconIds: Array.from({ length: 501 }, () => ID) }));
    assert.throws(() => batchTagSchema.parse({ iconIds: [ID], tags: [] }));
    assert.throws(() => batchTagSchema.parse({ iconIds: [ID], tags: ["a"], mode: "toggle" }));
  });
});

describe("objectId", () => {
  it("accepts 24 hex characters only", () => {
    assert.equal(objectId.parse(ID), ID);
    assert.throws(() => objectId.parse("123"));
    assert.throws(() => objectId.parse(`${ID}0`));
    assert.throws(() => objectId.parse("g".repeat(24)));
  });
});
