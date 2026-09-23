import { describe, it, expect } from "vitest";
import { decideReshuffle } from "./reshuffle";
import { formInitialState } from "../rules/formation";
import type { MatchState, Player } from "../types";
import type { CommandContext } from "./types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function draftState(): MatchState {
  return formInitialState(
    makePlayers(12),
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
    (i) => `t${i}`,
  );
}

function ctxWithIds(teamIds: string[]): CommandContext {
  let index = 0;
  return {
    random: () => 0.9,
    nextId: () => {
      const id = teamIds[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

describe("CEN-4: decideReshuffle", () => {
  it("reorders the players and records fresh team ids", () => {
    const state = draftState();
    const result = decideReshuffle(state, { type: "reshuffle" }, ctxWithIds(["t2", "t3"]));
    if (!("event" in result) || result.event.type !== "RESHUFFLED") {
      throw new Error("expected a RESHUFFLED event");
    }
    expect(result.event.teamIds).toEqual(["t2", "t3"]);
    expect(result.event.order).toHaveLength(12);
    expect(new Set(result.event.order)).toEqual(
      new Set(makePlayers(12).map((p) => p.id)),
    );
  });
});
