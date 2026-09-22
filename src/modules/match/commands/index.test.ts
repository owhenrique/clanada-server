import { describe, it, expect } from "vitest";
import { decide } from "./index";
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

function stateWithStatus(status: MatchState["status"]): MatchState {
  return {
    ...formInitialState(
      makePlayers(10),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
      (i) => `t${i}`,
    ),
    status,
  };
}

const ctx: CommandContext = { random: () => 0.9, nextId: () => "n0", timerRunning: false };

describe("CEN-3/CEN-19: decide — status permitido", () => {
  it("CEN-3: rejects reshuffle outside DRAFT", () => {
    const state = stateWithStatus("ACTIVE");
    try {
      decide(state, { type: "reshuffle" }, ctx);
      throw new Error("expected decide to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("INVALID_STATUS");
    }
  });

  it("CEN-19: rejects a command outside its allowed status (join after ENDED)", () => {
    const state = stateWithStatus("ENDED");
    try {
      decide(state, { type: "join", name: "X" }, ctx);
      throw new Error("expected decide to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("INVALID_STATUS");
    }
  });

  it("create needs no prior state and is not subject to a status check", () => {
    const result = decide(
      null,
      {
        type: "create",
        playerNames: ["A", "B"],
        config: { teamSize: 1, colors: ["verde"], gameMinutes: 10 },
      },
      ctx,
    );
    expect("event" in result).toBe(true);
  });

  it("dispatches to the matching handler when the status is allowed", () => {
    const state = stateWithStatus("DRAFT");
    const result = decide(state, { type: "start" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_STARTED" } });
  });
});
