import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { playerLeaves } from "./leave";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-6: playerLeaves", () => {
  it("removes a player who is in the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const next = playerLeaves(state, "p10");
    expect(next.queue.map((p) => p.id)).toEqual(["p11"]);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("with a queue: the first queued player fills the vacancy", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
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

  it("without a queue: the next team donates a player and becomes the queue", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t2"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p6", "p7", "p8", "p9"]);
  });

  it("without a queue: reassigns bibs after the donor dissolves", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams.map((t) => t.color)).toEqual(["verde", "azul"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const snapshot = JSON.stringify(state);
    playerLeaves(state, "p0");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
