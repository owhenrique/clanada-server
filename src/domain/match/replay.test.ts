import { describe, it, expect } from "vitest";
import { replay } from "./replay";
import type { Event } from "./events";
import type { MatchConfig, Player } from "./types";

const config: MatchConfig = {
  teamSize: 5,
  colors: ["verde", "vermelho", "azul"],
  gameMinutes: 10,
};

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

describe("CEN-27: replay is deterministic", () => {
  it("throws when the first event is not MATCH_CREATED", () => {
    expect(() =>
      replay([{ type: "MATCH_STARTED" }]),
    ).toThrow(/MATCH_CREATED/);
  });

  it("running the same 8-event history twice yields the same state", () => {
    const events: Event[] = [
      { type: "MATCH_CREATED", config, players: makePlayers(20), teamIds: ["t0", "t1", "t2", "t3"] },
      { type: "RESHUFFLED", order: makePlayers(20).map((p) => p.id), teamIds: ["t4", "t5", "t6", "t7"] },
      { type: "MATCH_STARTED" },
      { type: "GAME_WON", loserTeamId: "t5", decidedBy: "match", newTeamIds: [] },
      { type: "GAME_WON", loserTeamId: "t6", decidedBy: "match", newTeamIds: [] },
      { type: "GAME_WON", loserTeamId: "t7", decidedBy: "match", newTeamIds: [] },
      { type: "PLAYER_JOINED", player: { id: "pNovo", name: "Novo" }, newTeamIds: [] },
      { type: "PLAYERS_SWAPPED", playerAId: "p0", playerBId: "pNovo" },
    ];

    const first = replay(events);
    const second = replay(events);
    expect(second).toEqual(first);
  });
});
