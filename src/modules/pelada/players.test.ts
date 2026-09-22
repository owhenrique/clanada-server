import { describe, it, expect } from "vitest";
import { duplicateGroups, hasUnresolvedDuplicates } from "./players";
import type { Player } from "./types";

describe("CEN-10: duplicateGroups", () => {
  it("finds no groups when every name is unique", () => {
    const roster: Player[] = [
      { id: "p0", name: "Ana" },
      { id: "p1", name: "Bruno" },
    ];
    expect(duplicateGroups(roster)).toEqual([]);
  });

  it("groups players with the same name (case and space insensitive)", () => {
    const roster: Player[] = [
      { id: "p0", name: "João" },
      { id: "p1", name: "joão" },
      { id: "p2", name: "Ana" },
    ];
    const groups = duplicateGroups(roster);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((p) => p.id)).toEqual(["p0", "p1"]);
  });

  it("resolves once a duplicate is renamed to a unique name", () => {
    const roster: Player[] = [
      { id: "p0", name: "João Silva" },
      { id: "p1", name: "João" },
    ];
    expect(duplicateGroups(roster)).toEqual([]);
  });

  it("still groups identical names", () => {
    const roster: Player[] = [
      { id: "p0", name: "João" },
      { id: "p1", name: "João" },
    ];
    expect(duplicateGroups(roster)).toHaveLength(1);
  });
});

describe("CEN-10: hasUnresolvedDuplicates", () => {
  it("is false when there are no duplicates", () => {
    const roster: Player[] = [
      { id: "p0", name: "Ana" },
      { id: "p1", name: "Bruno" },
    ];
    expect(hasUnresolvedDuplicates(roster)).toBe(false);
  });

  it("is true while equal names have no distinction", () => {
    const roster: Player[] = [
      { id: "p0", name: "João" },
      { id: "p1", name: "João" },
    ];
    expect(hasUnresolvedDuplicates(roster)).toBe(true);
  });
});
