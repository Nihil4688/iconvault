// Tests for grouping dashboard projects into families by the start of their name.
import { describe, expect, it } from "vitest";
import { makeProject } from "../test/fixtures";
import { groupDisplayName, groupProjects, projectsInGroup } from "./projectGroups";

const named = (...names: string[]) => names.map((name) => makeProject({ id: name, name }));

describe("groupProjects", () => {
  it("groups projects that share a family before a hyphen, underscore, dot, slash or colon, ignoring case", () => {
    const tiles = groupProjects(named("bolddesk-agent", "BoldDesk_Customer", "bolddesk.email-template", "syncfusion/web", "Syncfusion: mobile"));
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({ kind: "group", group: { key: "bolddesk", name: "bolddesk" } });
    if (tiles[0].kind === "group") expect(tiles[0].group.projects.map((p) => p.id)).toEqual(["bolddesk-agent", "BoldDesk_Customer", "bolddesk.email-template"]);
    expect(tiles[1]).toMatchObject({ kind: "group", group: { key: "syncfusion", name: "syncfusion" } });
  });

  it("leaves a family of one, and names with only spaces, as single projects", () => {
    const tiles = groupProjects(named("bolddesk-agent", "My Icons", "My Logos", "Feather"));
    expect(tiles.map((tile) => tile.kind)).toEqual(["project", "project", "project", "project"]);
  });

  it("puts a project named just like the family into the group and uses its spelling", () => {
    const tiles = groupProjects(named("bolddesk-agent", "BoldDesk", "bolddesk-customer"));
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ kind: "group", group: { name: "BoldDesk" } });
  });

  it("keeps the order: a group takes the place of its first member", () => {
    const tiles = groupProjects(named("Alpha", "bolddesk-agent", "Bravo", "bolddesk-customer"));
    expect(tiles.map((tile) => (tile.kind === "group" ? `group:${tile.group.key}` : tile.project.id))).toEqual(["Alpha", "group:bolddesk", "Bravo"]);
  });
});

describe("projectsInGroup and groupDisplayName", () => {
  it("finds the members of a family even when only one of them is left", () => {
    expect(projectsInGroup(named("bolddesk-agent", "Feather"), "bolddesk").map((p) => p.id)).toEqual(["bolddesk-agent"]);
    expect(projectsInGroup(named("Feather"), "bolddesk")).toEqual([]);
  });

  it("names the group from its members, falling back to the key", () => {
    expect(groupDisplayName(named("BoldDesk-agent"), "bolddesk")).toBe("BoldDesk");
    expect(groupDisplayName([], "bolddesk")).toBe("bolddesk");
  });
});
