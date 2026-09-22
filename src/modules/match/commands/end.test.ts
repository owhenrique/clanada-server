import { describe, it, expect } from "vitest";
import { decideEnd } from "./end";
import { formInitialState } from "../rules/formation";
import type { CommandContext } from "./types";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const ctx: CommandContext = { random: () => 0, nextId: () => "unused", timerRunning: false };

describe("CEN-18: decideEnd", () => {
  it("produces MATCH_ENDED", () => {
    const state = {
      ...formInitialState(
        makePlayers(10),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideEnd(state, { type: "end" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_ENDED" } });
  });
});
