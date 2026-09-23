import { describe, it, expect } from "vitest";
import { decideStart } from "./start";
import { formInitialState } from "../rules/formation";
import { DomainError } from "../../../shared/errors/domain-error";
import type { Player } from "../types";
import type { CommandContext } from "./types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const ctx: CommandContext = { random: () => 0, nextId: () => "unused", timerRunning: false };

describe("CEN-7/CEN-8: decideStart", () => {
  it("CEN-7: rejects starting with fewer than 2 teams", () => {
    const state = formInitialState(
      makePlayers(8),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
      (i) => `t${i}`,
    );
    expect(state.teams).toHaveLength(1);
    try {
      decideStart(state, { type: "start" }, ctx);
      throw new Error("expected decideStart to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NOT_ENOUGH_TEAMS");
    }
  });

  it("CEN-8: produces MATCH_STARTED with 2 or more teams", () => {
    const state = formInitialState(
      makePlayers(10),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
      (i) => `t${i}`,
    );
    const result = decideStart(state, { type: "start" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_STARTED" } });
  });
});
