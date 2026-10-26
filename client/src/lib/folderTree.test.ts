// Tests for folder tree helpers.
import { describe, expect, it } from "vitest";
import type { FolderWithCount } from "../api/types";
import { buildFolderTree, descendantIds, flattenFolderTree, folderPath, totalIconCount } from "./folderTree";

const f = (id: string, name: string, parentId: string | null = null, orderIndex = 0, iconCount = 0): FolderWithCount => ({ id, projectId: "p", name, parentId, orderIndex, iconCount });

const folders = [f("ui", "UI", null, 1, 2), f("arrows", "Arrows", "ui", 0, 3), f("brand", "Brand", null, 0, 1), f("left", "Left", "arrows", 0, 4)];

describe("folder tree", () => {
  it("nests folders and orders siblings by position, then name", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.name)).toEqual(["Brand", "UI"]);
    expect(tree[1]?.children.map((n) => n.name)).toEqual(["Arrows"]);
    expect(tree[1]?.children[0]?.children[0]?.depth).toBe(2);
  });

  it("flattens depth-first", () => {
    expect(flattenFolderTree(buildFolderTree(folders)).map((n) => `${"-".repeat(n.depth)}${n.name}`)).toEqual(["Brand", "UI", "-Arrows", "--Left"]);
  });

  it("shows a folder with a missing parent at the top level", () => {
    const tree = buildFolderTree([f("x", "Orphan", "gone")]);
    expect(tree.map((n) => n.name)).toEqual(["Orphan"]);
  });

  it("sorts equal positions by name, ignoring case", () => {
    const tree = buildFolderTree([f("b", "banana"), f("a", "Apple"), f("c", "cherry")]);
    expect(tree.map((n) => n.name)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("builds a readable path", () => {
    expect(folderPath(folders, "left")).toBe("UI / Arrows / Left");
    expect(folderPath(folders, null)).toBe("Project root");
    expect(folderPath(folders, "missing")).toBe("Project root");
  });

  it("survives a cycle in the data when building a path", () => {
    expect(folderPath([f("a", "A", "b"), f("b", "B", "a")], "a")).toBe("B / A");
  });

  it("counts icons including subfolders", () => {
    const ui = buildFolderTree(folders)[1];
    expect(ui && totalIconCount(ui)).toBe(2 + 3 + 4);
  });

  it("finds descendants", () => {
    expect([...descendantIds(folders, "ui")].sort()).toEqual(["arrows", "left"]);
    expect([...descendantIds(folders, "left")]).toEqual([]);
  });
});
