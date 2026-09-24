import { describe, it, expect } from "vitest";
import { makePlayers } from "./test-fixtures";
import { DomainError } from "../../shared/errors/domain-error";
import type { CommandContext, MatchState, Event, Player, MatchConfig } from "./model";
import { decide, decideStart, decideEnd, applyEvent, replay } from "./engine";
import { formInitialState } from "./lineup";

function stateWithStatus(status: MatchState["status"]): MatchState {
  return {
    ...formInitialState(
      makePlayers(10),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      (i) => `t${i}`,
    ),
    status,
  };
}

describe("CEN-3/CEN-19: decide — status permitido", () => {
  const ctx: CommandContext = { random: () => 0.9, nextId: () => "n0", timerRunning: false };

  it("CEN-3: rejects reshuffle outside DRAFT", () => {
    const state = stateWithStatus("ACTIVE");
    try {
      decide(state, { type: "reshuffle" }, ctx);
      throw new Error("expected decide to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("INVALID_STATUS");
    }
  });

  it("CEN-19: rejects a command outside its allowed status (join after ENDED)", () => {
    const state = stateWithStatus("ENDED");
    try {
      decide(state, { type: "join", name: "X" }, ctx);
      throw new Error("expected decide to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("INVALID_STATUS");
    }
  });

  it("create needs no prior state and is not subject to a status check", () => {
    const result = decide(
      null,
      {
        type: "create",
        playerNames: ["A", "B"],
        config: { teamSize: 1, colors: ["verde"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      },
      ctx,
    );
    expect("event" in result).toBe(true);
  });

  it("dispatches to the matching handler when the status is allowed", () => {
    const state = stateWithStatus("DRAFT");
    const result = decide(state, { type: "start" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_STARTED" } });
  });
});

const ctx: CommandContext = { random: () => 0, nextId: () => "unused", timerRunning: false };

describe("CEN-7/CEN-8: decideStart", () => {
  it("CEN-7: rejects starting with fewer than 2 teams", () => {
    const state = formInitialState(
      makePlayers(8),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      (i) => `t${i}`,
    );
    expect(state.teams).toHaveLength(1);
    try {
      decideStart(state, { type: "start" }, ctx);
      throw new Error("expected decideStart to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NOT_ENOUGH_TEAMS");
    }
  });

  it("CEN-8: produces MATCH_STARTED with 2 or more teams", () => {
    const state = formInitialState(
      makePlayers(10),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      (i) => `t${i}`,
    );
    const result = decideStart(state, { type: "start" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_STARTED" } });
  });
});

describe("CEN-18: decideEnd", () => {
  it("produces MATCH_ENDED", () => {
    const state = {
      ...formInitialState(
        makePlayers(10),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideEnd(state, { type: "end" }, ctx);
    expect(result).toEqual({ event: { type: "MATCH_ENDED" } });
  });
});

const config: MatchConfig = {
  teamSize: 5,
  colors: ["verde", "vermelho", "azul"],
  gameMinutes: 10, ruleToggles: { arrivalPriority: false }
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

  it("PLAYER_LEFT with fallback none uses the circular donor search (S4)", () => {
    const players = makePlayers(15);
    const state = applyEvent(null, created(players, ["t0", "t1", "t2"]));
    const next = applyEvent(state, {
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "none",
      newTeamIds: [],
    });
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(next.queue.map((p) => p.id)).toEqual(["p11", "p12", "p13", "p14"]);
  });

  it("PLAYER_LEFT with fallback reduce-team-size shrinks teamSize (S4)", () => {
    const state = baseState();
    const next = applyEvent(state, {
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "reduce-team-size",
      newTeamIds: [],
    });
    expect(next.config.teamSize).toBe(4);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8"]);
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p11", "p9"]);
  });

  it("TEAM_SIZE_CHANGED reduces the team size and compacts the released players (S4)", () => {
    const state = baseState();
    const next = applyEvent(state, {
      type: "TEAM_SIZE_CHANGED",
      teamSize: 4,
      newTeamIds: ["tNovo"],
    });
    expect(next.config.teamSize).toBe(4);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1", "tNovo"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual(["p10", "p11", "p4", "p9"]);
    expect(next.queue).toEqual([]);
  });

  it("MATCH_ENDED switches the status to ENDED", () => {
    const state = baseState();
    const next = applyEvent(state, { type: "MATCH_ENDED" });
    expect(next.status).toBe("ENDED");
  });
});

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
