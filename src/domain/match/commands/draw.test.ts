import { describe, it, expect } from "vitest";
import { decideDraw } from "./draw";
import type { MatchState, Player, Team } from "../types";
import type { CommandContext } from "./types";

function mkPlayer(id: string): Player {
  return { id, name: id };
}

function fullTeam(id: string): Team {
  return {
    id,
    color: null,
    gameStreak: 0,
    players: Array.from({ length: 5 }, (_, i) => mkPlayer(`${id}-${i}`)),
  };
}

function mkState(teams: Team[]): MatchState {
  return {
    status: "ACTIVE",
    config: { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 },
    teams,
    queue: [],
  };
}

function idGen(): () => string {
  let n = 0;
  return () => `n${n++}`;
}

function ctx(random: () => number): CommandContext {
  return { random, nextId: idGen(), timerRunning: false };
}

describe("CEN-11/CEN-12: decideDraw", () => {
  it("CEN-11: fewer than two complete waiting teams asks for penalties, without an event", () => {
    const state = mkState([fullTeam("t0"), fullTeam("t1"), fullTeam("t2")]);
    const result = decideDraw(state, { type: "draw" }, ctx(() => 0));
    expect(result).toEqual({ penaltiesRequired: true });
  });

  it("CEN-12: with a swap, records who leaves first and the new team ids", () => {
    const state = mkState([
      fullTeam("t0"),
      fullTeam("t1"),
      fullTeam("t2"),
      fullTeam("t3"),
    ]);
    const low = decideDraw(state, { type: "draw" }, ctx(() => 0));
    if (!("event" in low) || low.event.type !== "GAME_DRAWN") {
      throw new Error("expected a GAME_DRAWN event");
    }
    expect(low.event.firstLeaverTeamId).toBe("t0");

    const high = decideDraw(state, { type: "draw" }, ctx(() => 0.9));
    if (!("event" in high) || high.event.type !== "GAME_DRAWN") {
      throw new Error("expected a GAME_DRAWN event");
    }
    expect(high.event.firstLeaverTeamId).toBe("t1");
    expect(high.event.newTeamIds).toEqual(["n0", "n1"]);
  });
});
