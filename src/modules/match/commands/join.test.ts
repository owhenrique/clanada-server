import { describe, it, expect } from "vitest";
import { decideJoin } from "./join";
import { formInitialState } from "../rules/formation";
import type { CommandContext } from "./types";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const ctx: CommandContext = { random: () => 0, nextId: () => "pNovo", timerRunning: false };

describe("CEN-14: decideJoin", () => {
  it("produces PLAYER_JOINED with a freshly generated id and no new teams", () => {
    const state = {
      ...formInitialState(
        makePlayers(8),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideJoin(state, { type: "join", name: "  Novo  " }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_JOINED",
      player: { id: "pNovo", name: "Novo" },
      newTeamIds: [],
    });
  });
});
