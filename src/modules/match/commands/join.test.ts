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

describe("CEN-6: decideJoin completing the queue", () => {
  it("CEN-6: records the new team id when the join compacts the queue, with no bib once B is already in use", () => {
    const ids = ["pNovo", "tNovo"];
    let index = 0;
    const nextId = (): string => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    };
    const state = {
      ...formInitialState(
        makePlayers(14),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideJoin(state, { type: "join", name: "Novo" }, { random: () => 0, nextId, timerRunning: false });
    if (!("event" in result) || result.event.type !== "PLAYER_JOINED") {
      throw new Error("expected a PLAYER_JOINED event");
    }
    expect(result.event.newTeamIds).toEqual(["tNovo"]);
  });
});
