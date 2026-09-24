import { describe, it, expect } from "vitest";
import { decideWin } from "./win";
import { formInitialState } from "../rules/formation";
import { DomainError } from "../../../shared/errors/domain-error";
import type { MatchState, Player } from "../types";
import type { CommandContext } from "./types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function activeState(count: number, colors: string[]): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function idGen(): () => string {
  let n = 0;
  return () => `n${n++}`;
}

const ctx = (nextId: () => string): CommandContext => ({
  random: () => 0,
  nextId,
  timerRunning: false,
});

describe("CEN-9/CEN-10: decideWin", () => {
  it("CEN-9: with a queue, records the ids of the newly formed team", () => {
    const state = activeState(12, ["verde", "vermelho", "azul"]);
    const result = decideWin(
      state,
      { type: "win", loserTeamId: "t1" },
      ctx(idGen()),
    );
    if (!("event" in result) || result.event.type !== "GAME_WON") {
      throw new Error("expected a GAME_WON event");
    }
    expect(result.event.decidedBy).toBe("match");
    expect(result.event.newTeamIds).toEqual(["n0"]);
  });

  it("without a queue, records no new team ids", () => {
    const state = activeState(10, ["verde", "vermelho"]);
    const result = decideWin(
      state,
      { type: "win", loserTeamId: "t1" },
      ctx(idGen()),
    );
    if (!("event" in result) || result.event.type !== "GAME_WON") {
      throw new Error("expected a GAME_WON event");
    }
    expect(result.event.newTeamIds).toEqual([]);
  });

  it("CEN-10: rejects a loserTeamId that is not on the field", () => {
    const state = activeState(15, ["verde", "vermelho", "azul"]);
    try {
      decideWin(state, { type: "win", loserTeamId: "t2" }, ctx(idGen()));
      throw new Error("expected decideWin to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_NOT_ON_FIELD");
    }
  });
});
