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

function activeState(count: number): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean): CommandContext {
  return { random: () => 0, nextId: () => "unused", timerRunning };
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

  it("does not lock a player who is off the field", () => {
    const state = activeState(15);
    const result = decideLeave(state, { type: "leave", playerId: "p10" }, ctx(true));
    expect("event" in result).toBe(true);
  });
});
