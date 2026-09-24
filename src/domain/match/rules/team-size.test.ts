import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { changeTeamSize } from "./team-size";
import type { Player, MatchState } from "../types";

function makePlayers(count: number, prefix = "p"): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
    name: `${prefix}${index}`,
  }));
}

const teamId = (index: number): string => `t${index}`;

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${n++}`;
}

describe("CEN-8: changeTeamSize reduces the team size", () => {
  it("sends the last N-m players of every team to the queue, in rotation order, then compacts", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = changeTeamSize(state, 3, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.config.teamSize).toBe(3);
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1", "t2", "tNew0", "tNew1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(result.teams[0]?.color).toBe("verde");
    expect(result.teams[3]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p8"]);
    expect(result.teams[4]?.players.map((p) => p.id)).toEqual(["p9", "p13", "p14"]);
    expect(result.queue).toEqual([]);
  });
});

describe("CEN-9: changeTeamSize increases the team size with enough queue", () => {
  it("fills every team from the front of the queue, in rotation order, without forming a new team", () => {
    const base = formInitialState(makePlayers(6), { teamSize: 3, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: makePlayers(6, "q") };
    const next = changeTeamSize(state, 5, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "q0", "q1"]);
    expect(result.teams[1]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p5", "q2", "q3"]);
    expect(result.queue.map((p) => p.id)).toEqual(["q4", "q5"]);
  });
});

describe("CEN-10: changeTeamSize increases by dissolving teams from the end of the rotation", () => {
  it("dissolves the last team into the queue when there are not enough players to fill everyone", () => {
    const base = formInitialState(makePlayers(9), { teamSize: 3, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: makePlayers(1, "q") };
    const next = changeTeamSize(state, 5, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "q0", "p6"]);
    expect(result.teams[1]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p5", "p7", "p8"]);
    expect(result.queue).toEqual([]);
  });

  it("rejects when even dissolving everything cannot keep 2 teams", () => {
    const base = formInitialState(makePlayers(6), { teamSize: 3, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const result = changeTeamSize(base, 10, idFactory("tNew"));
    expect(result).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    changeTeamSize(state, 3, idFactory("tNew"));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
