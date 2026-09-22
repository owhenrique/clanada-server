import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { playerJoins } from "./join";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function mkPlayer(id: string): Player {
  return { id, name: id };
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-7: playerJoins without completing the queue", () => {
  it("CEN-7: appends the new player to the end of the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const next = playerJoins(state, mkPlayer("pX"), () => "tNovo");
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p11", "pX"]);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const snapshot = JSON.stringify(state);
    playerJoins(state, mkPlayer("pX"), () => "tNovo");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-6: playerJoins completing the queue into a new team", () => {
  it("CEN-6: compacts the queue into a new team at the end of the rotation, with no bib once B is already in use", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const withQueue = { ...state, queue: makePlayers(14).slice(10) };
    const next = playerJoins(withQueue, mkPlayer("pX"), () => "tNovo");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1", "tNovo"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual(["p10", "p11", "p12", "p13", "pX"]);
    expect(next.teams[2]?.color).toBeNull();
    expect(next.queue).toEqual([]);
  });

  it("hands out a bib to the new team when it falls within the first B teams", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const withQueue = { ...state, queue: makePlayers(14).slice(10) };
    const next = playerJoins(withQueue, mkPlayer("pX"), () => "tNovo");
    expect(next.teams[2]?.color).toBe("azul");
  });
});
