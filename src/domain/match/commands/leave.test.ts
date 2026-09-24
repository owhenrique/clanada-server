import { describe, it, expect } from "vitest";
import { decideLeave } from "./leave";
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

function activeState(count: number, colors: string[] = ["verde", "vermelho", "azul"]): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean, nextId: () => string = () => "unused"): CommandContext {
  return { random: () => 0, nextId, timerRunning };
}

describe("CEN-15/CEN-16/CEN-17: decideLeave", () => {
  it("CEN-15: produces PLAYER_LEFT with fallback none and no new teams", () => {
    const state = activeState(15);
    const result = decideLeave(state, { type: "leave", playerId: "p0" }, ctx(false));
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "none",
      newTeamIds: [],
    });
  });

  it("CEN-16: rejects a non-existent player", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "fantasma" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_NOT_FOUND");
    }
  });

  it("CEN-17: rejects a player on an on-field team while the timer runs", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "p0" }, ctx(true));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_LOCKED");
    }
  });

  it("does not lock an off-field player who still has a donor available", () => {
    const state = activeState(20, ["verde", "vermelho", "azul", "amarelo"]);
    const result = decideLeave(state, { type: "leave", playerId: "p10" }, ctx(true));
    expect("event" in result).toBe(true);
  });
});

describe("CEN-3/CEN-5: decideLeave without a donor", () => {
  it("CEN-3: rejects with NO_DONOR_AVAILABLE when there are only the two on-field teams", () => {
    const state = activeState(10);
    try {
      decideLeave(state, { type: "leave", playerId: "p0" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NO_DONOR_AVAILABLE");
    }
  });

  it("CEN-5: rejects with NO_DONOR_AVAILABLE when the only off-field team is the affected one", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "p10" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NO_DONOR_AVAILABLE");
    }
  });
});

describe("CEN-4: decideLeave with fallback reduce-team-size", () => {
  it("produces PLAYER_LEFT with fallback reduce-team-size and records any new team ids", () => {
    const state = activeState(10);
    let n = 0;
    const result = decideLeave(
      state,
      { type: "leave", playerId: "p0", fallback: "reduce-team-size" },
      ctx(false, () => `id${n++}`),
    );
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "reduce-team-size",
      newTeamIds: [],
    });
  });
});
