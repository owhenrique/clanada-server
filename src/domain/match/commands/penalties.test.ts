import { describe, it, expect } from "vitest";
import { decidePenalties } from "./penalties";
import { formInitialState } from "../rules/formation";
import type { CommandContext } from "./types";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const ctx: CommandContext = { random: () => 0, nextId: () => "n0", timerRunning: false };

describe("CEN-13: decidePenalties", () => {
  it("produces GAME_WON with decidedBy penalties", () => {
    const state = {
      ...formInitialState(
        makePlayers(10),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decidePenalties(state, { type: "penalties", loserTeamId: "t1" }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "GAME_WON",
      loserTeamId: "t1",
      decidedBy: "penalties",
      newTeamIds: [],
    });
  });
});
