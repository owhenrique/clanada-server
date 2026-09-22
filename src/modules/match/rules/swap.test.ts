import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { swapPlayers } from "./swap";
import type { Player, MatchState, Team } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function mkPlayer(id: string): Player {
  return { id, name: id };
}

function mkTeam(id: string, color: string | null, gameStreak: number): Team {
  return {
    id,
    color,
    gameStreak,
    players: Array.from({ length: 5 }, (_, i) => mkPlayer(`${id}-${i}`)),
  };
}

function mkState(teams: Team[], queue: Player[], colors: string[]): MatchState {
  return {
    status: "ACTIVE",
    config: { teamSize: 5, colors, gameMinutes: 10 },
    teams,
    queue,
  };
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-9: swapPlayers", () => {
  it("swaps two players who are on different teams", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const next = swapPlayers(state, "p1", "p6");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p6",
      "p2",
      "p3",
      "p4",
    ]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual([
      "p5",
      "p1",
      "p7",
      "p8",
      "p9",
    ]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
    ]);
  });

  it("swaps a team player with a queued player, each landing in the other's slot", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const next = swapPlayers(state, "p2", "p11");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p11",
      "p3",
      "p4",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p2"]);
  });

  it("swapping two players on the same team leaves the team's composition unchanged", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const next = swapPlayers(state, "p0", "p3");
    expect([...(next.teams[0]?.players.map((p) => p.id) ?? [])].sort()).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
  });

  it("is a no-op when swapping a player with itself", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const next = swapPlayers(state, "p0", "p0");
    expect(next).toEqual(state);
  });

  it("is a no-op when either player id does not exist", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    expect(swapPlayers(state, "p0", "ghost")).toEqual(state);
    expect(swapPlayers(state, "ghost", "p0")).toEqual(state);
  });

  it("does not change bibs or match streaks of the teams involved", () => {
    const state = mkState(
      [mkTeam("t0", "verde", 3), mkTeam("t1", "vermelho", 1)],
      [],
      ["verde", "vermelho"],
    );
    const next = swapPlayers(state, "t0-0", "t1-0");
    expect(next.teams[0]?.color).toBe("verde");
    expect(next.teams[0]?.gameStreak).toBe(3);
    expect(next.teams[1]?.color).toBe("vermelho");
    expect(next.teams[1]?.gameStreak).toBe(1);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 }, teamId);
    const snapshot = JSON.stringify(state);
    swapPlayers(state, "p1", "p6");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
