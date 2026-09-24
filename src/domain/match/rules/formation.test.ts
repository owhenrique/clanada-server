import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-1: formInitialState", () => {
  it("forms as many full teams as possible", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(3);
    expect(state.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(state.teams[2]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
    ]);
  });

  it("puts leftover players in the queue, in order", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(2);
    expect(state.queue.map((p) => p.id)).toEqual(["p10", "p11"]);
  });

  it("has no queue when the count is a multiple of the team size", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.queue).toEqual([]);
  });

  it("assigns colors to teams in order", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.color)).toEqual([
      "verde",
      "vermelho",
      "azul",
    ]);
  });

  it("leaves teams without color when there are fewer bibs than teams", () => {
    const state = formInitialState(makePlayers(20), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(4);
    expect(state.teams.map((t) => t.color)).toEqual([
      "verde",
      "vermelho",
      "azul",
      null,
    ]);
  });

  it("uses only as many colors as there are teams", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho", "azul", "amarelo"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.color)).toEqual(["verde", "vermelho"]);
  });

  it("assigns team ids from the factory and starts streaks at zero", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(state.teams.every((t) => t.gameStreak === 0)).toBe(true);
  });

  it("keeps the config and starts in DRAFT", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.config.teamSize).toBe(5);
    expect(state.config.colors).toEqual(["verde", "vermelho"]);
    expect(state.status).toBe("DRAFT");
  });
});
