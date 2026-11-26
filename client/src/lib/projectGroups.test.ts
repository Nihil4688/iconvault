// Tests for grouping dashboard projects by the group their owner chose.
import { describe, expect, it } from "vitest";
import { makeProject } from "../test/fixtures";
import { groupKey, groupNames, groupProjects, projectsInGroup } from "./projectGroups";

const project = (id: string, group = "") => makeProject({ id, name: id, group });
const ids = (tiles: ReturnType<typeof groupProjects>) => tiles.map((tile) => (tile.kind === "group" ? `group:${tile.group.key}(${tile.group.projects.map((p) => p.id).join(",")})` : tile.project.id));

describe("groupProjects", () => {
  it("groups only the projects that were put in a group, whatever their names", () => {
    const tiles = groupProjects([project("bolddesk-agent"), project("bolddesk-customer"), project("Agent", "BoldDesk"), project("Email Template", "BoldDesk")]);
    expect(ids(tiles)).toEqual(["bolddesk-agent", "bolddesk-customer", "group:bolddesk(Agent,Email Template)"]);
  });

  it("treats group names that differ only in case or spaces as one group, spelled as its first project spells it", () => {
    const tiles = groupProjects([project("a", "BoldDesk"), project("b", "  bolddesk "), project("c", "Bold  Desk")]);
    expect(ids(tiles)).toEqual(["group:bolddesk(a,b)", "group:bold desk(c)"]);
    expect(tiles[0]).toMatchObject({ kind: "group", group: { name: "BoldDesk" } });
  });

  it("shows a group with a single project as a group, because it was chosen by hand", () => {
    expect(ids(groupProjects([project("a", "BoldDesk"), project("b")]))).toEqual(["group:bolddesk(a)", "b"]);
  });

  it("keeps the order: a group takes the place of its first project", () => {
    expect(ids(groupProjects([project("Alpha"), project("a", "BoldDesk"), project("Bravo"), project("b", "BoldDesk")]))).toEqual(["Alpha", "group:bolddesk(a,b)", "Bravo"]);
  });
});

describe("projectsInGroup and groupNames", () => {
  it("finds a group's projects by its key", () => {
    const projects = [project("a", "BoldDesk"), project("b"), project("c", "bolddesk")];
    expect(groupKey(" Bold   Desk ")).toBe("bold desk");
    expect(projectsInGroup(projects, "bolddesk").map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("lists every group name once, sorted", () => {
    expect(groupNames([project("a", "Syncfusion"), project("b", "BoldDesk"), project("c", "bolddesk"), project("d")])).toEqual(["BoldDesk", "Syncfusion"]);
  });
});
