import { describe, it, expect } from "vitest";
import { applyEvent } from "./apply-event";
import type { Player, MatchConfig, MatchState } from "./types";
import type { Event } from "./events";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const config: MatchConfig = {
  teamSize: 5,
  colors: ["verde", "vermelho", "azul"],
  gameMinutes: 10,
};

function created(players: Player[], teamIds: string[]): Event {
  return { type: "MATCH_CREATED", config, players, teamIds };
}

function baseState(): MatchState {
  return applyEvent(null, created(makePlayers(12), ["t0", "t1"]));
}

describe("apply-event: um teste por evento", () => {
  it("MATCH_CREATED forms the initial state without touching random/nextId again", () => {
    const state = baseState();
    expect(state.status).toBe("DRAFT");
    expect(state.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(state.queue.map((p) => p.id)).toEqual(["p10", "p11"]);
  });

  it("RESHUFFLED reorders every player and assigns fresh team ids", () => {
    const state = baseState();
    const order = [...state.teams.flatMap((t) => t.players), ...state.queue]
      .map((p) => p.id)
      .reverse();
    const next = applyEvent(state, { type: "RESHUFFLED", order, teamIds: ["t2", "t3"] });
    expect(next.teams.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p11",
      "p10",
      "p9",
      "p8",
      "p7",
    ]);
  });

  it("PLAYERS_SWAPPED trades the exact positions of the two players", () => {
    const state = baseState();
    const next = applyEvent(state, {
      type: "PLAYERS_SWAPPED",
      playerAId: "p0",
      playerBId: "p10",
    });
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p0", "p11"]);
  });

  it("MATCH_STARTED switches the status to ACTIVE without touching teams/queue", () => {
    const state = baseState();
    const next = applyEvent(state, { type: "MATCH_STARTED" });
    expect(next.status).toBe("ACTIVE");
    expect(next.teams).toEqual(state.teams);
    expect(next.queue).toEqual(state.queue);
  });

  it("GAME_WON — PROJETO.md reference example: 12 players, Q1 vs Q2, Fila[K,L]", () => {
    const players = [
      ...["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((id) => ({
        id,
        name: id,
      })),
      { id: "K", name: "K" },
      { id: "L", name: "L" },
    ];
    let state = applyEvent(null, created(players, ["Q1", "Q2"]));
    state = applyEvent(state, { type: "MATCH_STARTED" });
    const next = applyEvent(state, {
      type: "GAME_WON",
      loserTeamId: "Q2",
      decidedBy: "match",
      newTeamIds: ["t-new"],
    });
    expect(next.teams.map((t) => t.id)).toEqual(["Q1", "t-new"]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual([
      "K",
      "L",
      "F",
      "G",
      "H",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["I", "J"]);
    expect(next.teams[0]?.gameStreak).toBe(1);
  });

  it("GAME_DRAWN reforms the two leaving teams in the recorded order", () => {
    const players = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}`,
    }));
    let state = applyEvent(null, created(players, ["t0", "t1", "t2", "t3"]));
    state = applyEvent(state, { type: "MATCH_STARTED" });
    const next = applyEvent(state, {
      type: "GAME_DRAWN",
      firstLeaverTeamId: "t1",
      newTeamIds: ["n0", "n1"],
    });
    expect(next.teams.map((t) => t.id)).toEqual(["t2", "t3", "n0", "n1"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
    ]);
    expect(next.teams[3]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
  });

  it("PLAYER_JOINED appends to the end of the queue", () => {
    const state = baseState();
    const next = applyEvent(state, {
      type: "PLAYER_JOINED",
      player: { id: "pNovo", name: "Novo" },
      newTeamIds: [],
    });
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p11", "pNovo"]);
  });

  it("PLAYER_LEFT with fallback none reproduces the ported (pre-S4) donor path", () => {
    const players = makePlayers(15);
    const state = applyEvent(null, created(players, ["t0", "t1", "t2"]));
    const next = applyEvent(state, {
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "none",
      newTeamIds: [],
    });
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t2"]);
    expect(next.queue.map((p) => p.id)).toEqual(["p6", "p7", "p8", "p9"]);
  });

  it("PLAYER_LEFT with fallback reduce-team-size is not implemented yet (S4)", () => {
    const state = baseState();
    expect(() =>
      applyEvent(state, {
        type: "PLAYER_LEFT",
        playerId: "p0",
        fallback: "reduce-team-size",
        newTeamIds: [],
      }),
    ).toThrow(/not implemented/);
  });

  it("TEAM_SIZE_CHANGED is not implemented yet (S4)", () => {
    const state = baseState();
    expect(() =>
      applyEvent(state, { type: "TEAM_SIZE_CHANGED", teamSize: 4, newTeamIds: [] }),
    ).toThrow(/not implemented/);
  });

  it("MATCH_ENDED switches the status to ENDED", () => {
    const state = baseState();
    const next = applyEvent(state, { type: "MATCH_ENDED" });
    expect(next.status).toBe("ENDED");
  });
});
