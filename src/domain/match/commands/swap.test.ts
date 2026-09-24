import { describe, it, expect } from "vitest";
import { decideSwap } from "./swap";
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

function activeState(): MatchState {
  const state = formInitialState(
    makePlayers(12),
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean): CommandContext {
  return { random: () => 0, nextId: () => "unused", timerRunning };
}

describe("CEN-5/CEN-6: decideSwap", () => {
  it("CEN-5: rejects when a player on an on-field team is locked by the timer", () => {
    const state = activeState();
    expect(() =>
      decideSwap(
        state,
        { type: "swap", playerAId: "p0", playerBId: "p10" },
        ctx(true),
      ),
    ).toThrow(DomainError);
  });

  it("CEN-6: allows the swap when the timer is stopped", () => {
    const state = activeState();
    const result = decideSwap(
      state,
      { type: "swap", playerAId: "p0", playerBId: "p10" },
      ctx(false),
    );
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYERS_SWAPPED",
      playerAId: "p0",
      playerBId: "p10",
    });
  });

  it("does not lock a swap between two non-on-field players", () => {
    const state = activeState();
    const result = decideSwap(
      state,
      { type: "swap", playerAId: "p10", playerBId: "p11" },
      ctx(true),
    );
    expect("event" in result).toBe(true);
  });

  it("rejects a non-existent player", () => {
    const state = activeState();
    try {
      decideSwap(
        state,
        { type: "swap", playerAId: "p0", playerBId: "ghost" },
        ctx(false),
      );
      throw new Error("expected decideSwap to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_NOT_FOUND");
    }
  });
});
