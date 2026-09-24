import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { playerLeaves, playerLeavesWithReducedTeamSize, findDonorIndex } from "./leave";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const teamId = (index: number): string => `t${index}`;

describe("findDonorIndex", () => {
  it("never returns an on-field index (0 or 1)", () => {
    expect(findDonorIndex(4, 0)).toBe(2);
    expect(findDonorIndex(4, 1)).toBe(2);
  });

  it("returns null when only the two on-field teams exist", () => {
    expect(findDonorIndex(2, 0)).toBeNull();
  });

  it("returns null when the only off-field team is the affected one", () => {
    expect(findDonorIndex(3, 2)).toBeNull();
  });
});

describe("CEN-6: playerLeaves", () => {
  it("removes a player who is in the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p10");
    expect(next.queue.map((p) => p.id)).toEqual(["p11"]);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("with a queue: the first queued player fills the vacancy", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p10",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p11"]);
  });

  it("CEN-1: without a queue, the donor is the first team off the field, never the on-field opponent", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p10",
    ]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8", "p9"]);
    expect(next.teams[1]?.color).toBe("vermelho");
    expect(next.queue.map((p) => p.id)).toEqual(["p11", "p12", "p13", "p14"]);
  });

  it("CEN-2: without a queue, the donor search wraps circularly when the affected team is last in rotation", () => {
    const state = formInitialState(makePlayers(20), { teamSize: 5, colors: ["verde", "vermelho", "azul", "amarelo"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p15");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1", "t3"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p16",
      "p17",
      "p18",
      "p19",
      "p10",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p11", "p12", "p13", "p14"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    playerLeaves(state, "p0");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-4: playerLeavesWithReducedTeamSize", () => {
  it("shrinks teamSize by one and sends the last player of every other team to the queue", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeavesWithReducedTeamSize(state, "p0", () => "tNovo");
    expect(next.config.teamSize).toBe(4);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8"]);
    expect(next.queue.map((p) => p.id)).toEqual(["p9"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    playerLeavesWithReducedTeamSize(state, "p0", () => "tNovo");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
