import { describe, it, expect } from "vitest";
import { decideChangeTeamSize } from "./change-team-size";
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

function activeState(count: number, teamSize: number): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean): CommandContext {
  return { random: () => 0, nextId: () => "tNovo", timerRunning };
}

describe("CEN-11: decideChangeTeamSize rejects when fewer than 2 teams would survive", () => {
  it("CEN-11: rejects with TEAM_SIZE_NOT_ALLOWED", () => {
    const state = activeState(6, 3);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 10 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });
});

describe("CEN-12: decideChangeTeamSize rejects invalid values", () => {
  it("CEN-12: rejects teamSize below 1", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 0 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });

  it("CEN-12: rejects a teamSize equal to the current one", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 5 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });
});

describe("CEN-13: decideChangeTeamSize rejects while the timer is running", () => {
  it("CEN-13: rejects with TIMER_RUNNING", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 4 }, ctx(true));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TIMER_RUNNING");
    }
  });
});

describe("decideChangeTeamSize accepts a valid change", () => {
  it("produces TEAM_SIZE_CHANGED with the recorded new team ids", () => {
    const state = activeState(10, 5);
    const result = decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 4 }, ctx(false));
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "TEAM_SIZE_CHANGED",
      teamSize: 4,
      newTeamIds: [],
    });
  });
});
