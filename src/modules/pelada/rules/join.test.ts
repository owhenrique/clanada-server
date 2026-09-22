import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { playerJoins } from "./join";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function mkPlayer(id: string): Player {
  return { id, name: id };
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-7: playerJoins", () => {
  it("appends the new player to the end of the queue", () => {
    const state = formInitialState(
      makePlayers(12),
      5,
      ["verde", "vermelho"],
      teamId,
    );
    const next = playerJoins(state, mkPlayer("pX"));
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p11", "pX"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(
      makePlayers(12),
      5,
      ["verde", "vermelho"],
      teamId,
    );
    const snapshot = JSON.stringify(state);
    playerJoins(state, mkPlayer("pX"));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
