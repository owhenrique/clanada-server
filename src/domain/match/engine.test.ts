import { describe, it, expect } from "vitest";
import { makePlayers } from "./test-fixtures";
import { DomainError } from "../../shared/errors/domain-error";
import type { CommandContext, MatchState, Event, Player, MatchConfig, DecideResult } from "./model";
import { DEFAULT_SPLIT_CONFIG } from "./model";
import { decide, decideStart, decideEnd, applyEvent, replay } from "./engine";
import { formInitialState } from "./lineup";
import { TEAM_NAMES } from "./team-names";

function stateWithStatus(status: MatchState["status"]): MatchState {
  return {
    ...formInitialState(
      makePlayers(10),
      {
        teamSize: 5,
        colors: ["verde", "vermelho"],
        gameMinutes: 10,
        ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
        split: DEFAULT_SPLIT_CONFIG,
      },
      (i) => `t${i}`,
    ),
    status,
  };
}

describe("CEN-3/CEN-19: decide — status permitido", () => {
  const ctx: CommandContext = {
    random: () => 0.9,
    nextId: () => "n0",
    timerRunning: false,
  };

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
        config: {
          teamSize: 1,
          colors: ["verde"],
          gameMinutes: 10,
          ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
          split: DEFAULT_SPLIT_CONFIG,
        },
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

const ctx: CommandContext = {
  random: () => 0,
  nextId: () => "unused",
  timerRunning: false,
};

describe("CEN-7/CEN-8: decideStart", () => {
  it("CEN-7: rejects starting with fewer than 2 teams", () => {
    const state = formInitialState(
      makePlayers(8),
      {
        teamSize: 5,
        colors: ["verde", "vermelho"],
        gameMinutes: 10,
        ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
        split: DEFAULT_SPLIT_CONFIG,
      },
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
      {
        teamSize: 5,
        colors: ["verde", "vermelho"],
        gameMinutes: 10,
        ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
        split: DEFAULT_SPLIT_CONFIG,
      },
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
        {
          teamSize: 5,
          colors: ["verde", "vermelho"],
          gameMinutes: 10,
          ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
          split: DEFAULT_SPLIT_CONFIG,
        },
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
  gameMinutes: 10,
  ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
  split: DEFAULT_SPLIT_CONFIG,
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
    const next = applyEvent(state, {
      type: "RESHUFFLED",
      order,
      teamIds: ["t2", "t3"],
    });
    expect(next.teams.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual(["p11", "p10", "p9", "p8", "p7"]);
  });

  it("PLAYERS_SWAPPED trades the exact positions of the two players", () => {
    const state = baseState();
    const next = applyEvent(state, {
      type: "PLAYERS_SWAPPED",
      playerAId: "p0",
      playerBId: "p10",
    });
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual(["p10", "p1", "p2", "p3", "p4"]);
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
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["K", "L", "F", "G", "H"]);
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
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8", "p9"]);
    expect(next.teams[3]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
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
    expect(() => replay([{ type: "MATCH_STARTED" }])).toThrow(/MATCH_CREATED/);
  });

  it("running the same 8-event history twice yields the same state", () => {
    const events: Event[] = [
      {
        type: "MATCH_CREATED",
        config,
        players: makePlayers(20),
        teamIds: ["t0", "t1", "t2", "t3"],
      },
      {
        type: "RESHUFFLED",
        order: makePlayers(20).map((p) => p.id),
        teamIds: ["t4", "t5", "t6", "t7"],
      },
      { type: "MATCH_STARTED" },
      {
        type: "GAME_WON",
        loserTeamId: "t5",
        decidedBy: "match",
        newTeamIds: [],
      },
      {
        type: "GAME_WON",
        loserTeamId: "t6",
        decidedBy: "match",
        newTeamIds: [],
      },
      {
        type: "GAME_WON",
        loserTeamId: "t7",
        decidedBy: "match",
        newTeamIds: [],
      },
      {
        type: "PLAYER_JOINED",
        player: { id: "pNovo", name: "Novo" },
        newTeamIds: [],
      },
      { type: "PLAYERS_SWAPPED", playerAId: "p0", playerBId: "pNovo" },
    ];

    const first = replay(events);
    const second = replay(events);
    expect(second).toEqual(first);
  });
});

describe("E1: team names", () => {
  const twoColorConfig: MatchConfig = { ...config, colors: ["verde", "vermelho"] };

  it("names the teams of a legacy MATCH_CREATED in list order", () => {
    const state = applyEvent(null, created(makePlayers(12), ["t0", "t1"]));
    expect(state.teams.map((team) => team.name)).toEqual(["Atacadão", "Tatico"]);
  });

  it("keeps the name when a waiting team enters and its bib changes", () => {
    let state = applyEvent(null, {
      type: "MATCH_CREATED",
      config: twoColorConfig,
      players: makePlayers(20),
      teamIds: ["t0", "t1", "t2", "t3"],
    });
    state = applyEvent(state, { type: "MATCH_STARTED" });
    expect(state.teams.map((team) => team.color)).toEqual(["verde", "vermelho", null, null]);

    const next = applyEvent(state, {
      type: "GAME_WON",
      loserTeamId: "t0",
      decidedBy: "match",
      newTeamIds: [],
    });

    expect(next.teams.map((team) => team.id)).toEqual(["t1", "t2", "t3", "t0"]);
    expect(next.teams.map((team) => team.name)).toEqual([
      "Tatico",
      "Assaí",
      "Carrefour",
      "Atacadão",
    ]);
    expect(next.teams[1]?.color).toBe("verde");
    expect(next.teams[1]?.name).toBe("Assaí");
  });

  it("returns a dissolved team's name to the newly formed team", () => {
    let state = applyEvent(null, created(makePlayers(22), ["t0", "t1", "t2", "t3"]));
    state = applyEvent(state, { type: "MATCH_STARTED" });

    const next = applyEvent(state, {
      type: "GAME_WON",
      loserTeamId: "t0",
      decidedBy: "match",
      newTeamIds: ["n0"],
    });

    expect(next.teams.map((team) => team.id)).toEqual(["t1", "t2", "t3", "n0"]);
    expect(next.teams.map((team) => team.name)).toEqual([
      "Tatico",
      "Assaí",
      "Carrefour",
      "Atacadão",
    ]);
    expect(new Set(next.teams.map((team) => team.name)).size).toBe(next.teams.length);
  });

  it("leaves the 21st active team without a name", () => {
    const players = makePlayers(21);
    const state = applyEvent(null, {
      type: "MATCH_CREATED",
      config: { ...config, teamSize: 1, colors: [] },
      players,
      teamIds: players.map((_, index) => `t${index}`),
    });

    expect(state.teams).toHaveLength(21);
    expect(state.teams.slice(0, 20).map((team) => team.name)).toEqual([...TEAM_NAMES]);
    expect(state.teams[20]?.name).toBeNull();
  });

  it("replays a legacy log without teamNames deterministically, taking no random source", () => {
    const events: Event[] = [
      {
        type: "MATCH_CREATED",
        config,
        players: makePlayers(22),
        teamIds: ["t0", "t1", "t2", "t3"],
      },
      { type: "MATCH_STARTED" },
      {
        type: "GAME_WON",
        loserTeamId: "t0",
        decidedBy: "match",
        newTeamIds: ["n0"],
      },
    ];

    const first = replay(events);
    const second = replay(events);

    expect(second).toEqual(first);
    expect(first.teams.map((team) => team.name)).toEqual([
      "Tatico",
      "Assaí",
      "Carrefour",
      "Atacadão",
    ]);
    expect(first.queue.map((player) => player.id)).toEqual(["p3", "p4"]);
  });

  it("replays the recorded teamNames exactly and keeps the surviving team's name", () => {
    const createdState = applyEvent(null, {
      type: "MATCH_CREATED",
      config,
      players: makePlayers(12),
      teamIds: ["t0", "t1"],
      teamNames: ["Big Box", null],
    });
    expect(createdState.teams.map((team) => team.name)).toEqual(["Big Box", null]);

    const next = applyEvent(createdState, {
      type: "GAME_WON",
      loserTeamId: "t0",
      decidedBy: "match",
      newTeamIds: ["n0"],
      teamNames: ["Comper"],
    });

    expect(next.teams.map((team) => team.id)).toEqual(["t1", "n0"]);
    expect(next.teams.map((team) => team.name)).toEqual([null, "Comper"]);
  });

  function decisionEvent(result: DecideResult): Event {
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    return result.event;
  }

  function decidedLog(): { events: Event[]; before: MatchState } {
    let nextId = 0;
    const ctx: CommandContext = {
      random: () => 0,
      nextId: () => `n${nextId++}`,
      timerRunning: false,
    };
    const created = decisionEvent(
      decide(
        null,
        {
          type: "create",
          playerNames: Array.from({ length: 22 }, (_, index) => `Player${index}`),
          config,
        },
        ctx,
      ),
    );
    const started = decisionEvent(
      decide(applyEvent(null, created), { type: "start" }, ctx),
    );
    const before = applyEvent(applyEvent(null, created), started);
    const [firstTeam] = before.teams;
    if (firstTeam === undefined) {
      throw new Error("fixture needs an on-field team");
    }
    const won = decisionEvent(
      decide(before, { type: "win", loserTeamId: firstTeam.id }, ctx),
    );
    return { events: [created, started, won], before };
  }

  it("replays the names drawn by the decisions", () => {
    const { events, before } = decidedLog();
    const last = events[events.length - 1];
    if (last === undefined) {
      throw new Error("fixture needs a last event");
    }
    const replayed = replay(events);
    expect(replayed).toEqual(applyEvent(before, last));
    expect(replayed.teams.map((team) => team.name)).toEqual([
      "Tatico",
      "Assaí",
      "Carrefour",
      "Atacadão",
    ]);
  });

  it("restores the previous name when the last event is undone", () => {
    const { events, before } = decidedLog();
    const undone = replay(events.slice(0, -1));
    expect(undone).toEqual(before);
    expect(undone.teams.map((team) => team.name)).toEqual([
      "Atacadão",
      "Tatico",
      "Assaí",
      "Carrefour",
    ]);
  });
});

describe("E5: draw without penalties (drawKeepsVeteran)", () => {
  const ruleConfig = (drawKeepsVeteran: boolean, teamSize = 2): MatchConfig => ({
    teamSize,
    colors: ["verde", "vermelho"],
    gameMinutes: 10,
    ruleToggles: { arrivalPriority: false, drawKeepsVeteran },
    split: DEFAULT_SPLIT_CONFIG,
  });
  const arrivalPlayers: Player[] = [
    { id: "a", name: "A", arrival: 3 },
    { id: "b", name: "B", arrival: 4 },
    { id: "c", name: "C", arrival: 1 },
    { id: "d", name: "D", arrival: 6 },
    { id: "e", name: "E", arrival: 2 },
    { id: "f", name: "F", arrival: 5 },
  ];

  function started(drawKeepsVeteran: boolean, players: Player[] = arrivalPlayers): Event[] {
    return [
      {
        type: "MATCH_CREATED",
        config: ruleConfig(drawKeepsVeteran),
        players,
        teamIds: ["t0", "t1", "t2"].slice(0, Math.floor(players.length / 2)),
      },
      { type: "MATCH_STARTED" },
    ];
  }

  function ctx(): CommandContext {
    let n = 0;
    return { random: () => 0.3, nextId: () => `n${n++}`, timerRunning: false };
  }

  function run(events: Event[], command: Parameters<typeof decide>[1]): Event[] {
    const result = decide(replay(events), command, ctx());
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    return [...events, result.event];
  }

  it("CA-2: rule off still asks for penalties", () => {
    const result = decide(replay(started(false)), { type: "draw" }, ctx());
    expect(result).toEqual({ penaltiesRequired: true });
  });

  it("CA-4: first draw keeps the team of the earliest arrival", () => {
    const events = run(started(true), { type: "draw" });
    expect(events.at(-1)).toMatchObject({ type: "GAME_WON", loserTeamId: "t0", decidedBy: "draw" });
    const state = replay(events);
    expect(state.teams.map((t) => t.id)).toEqual(["t1", "t2", "t0"]);
    expect(state.teams[0]?.gameStreak).toBe(0);
    expect(state.veteranTeamId).toBe("t1");
  });

  it("CA-3: the veteran stays even if the newcomer has the earliest arrival, streak unchanged", () => {
    const afterWin = run(started(true), { type: "win", loserTeamId: "t1" });
    expect(replay(afterWin).veteranTeamId).toBe("t0");
    const events = run(afterWin, { type: "draw" });
    expect(events.at(-1)).toMatchObject({ type: "GAME_WON", loserTeamId: "t2", decidedBy: "draw" });
    const state = replay(events);
    expect(state.teams.map((t) => t.id)).toEqual(["t0", "t1", "t2"]);
    expect(state.teams[0]?.gameStreak).toBe(1);
    expect(state.teams[2]?.gameStreak).toBe(0);
  });

  it("same team drawing again stays veteran", () => {
    const first = run(started(true), { type: "draw" });
    const second = run(first, { type: "draw" });
    expect(second.at(-1)).toMatchObject({ loserTeamId: "t2", decidedBy: "draw" });
    expect(replay(second).teams[0]?.id).toBe("t1");
  });

  it("CA-5: with two complete teams waiting both leave as before and the veteran is cleared", () => {
    const players = makePlayers(8).map((p, index) => ({ ...p, arrival: index + 1 }));
    const created: Event[] = [
      { type: "MATCH_CREATED", config: ruleConfig(true), players, teamIds: ["t0", "t1", "t2", "t3"] },
      { type: "MATCH_STARTED" },
    ];
    const afterWin = run(created, { type: "win", loserTeamId: "t1" });
    const events = run(afterWin, { type: "draw" });
    expect(events.at(-1)?.type).toBe("GAME_DRAWN");
    expect(replay(events).veteranTeamId).toBeUndefined();
  });

  it("CA-6: changing the rule in the menu applies from the next draw", () => {
    const events = run(started(false), { type: "changeRules", ruleToggles: { drawKeepsVeteran: true } });
    expect(events.at(-1)).toEqual({
      type: "RULES_CHANGED",
      ruleToggles: { arrivalPriority: false, drawKeepsVeteran: true },
    });
    expect(replay(events).config.ruleToggles.drawKeepsVeteran).toBe(true);
    expect(run(events, { type: "draw" }).at(-1)).toMatchObject({ decidedBy: "draw" });
  });

  it("CA-6: changing the rule is only allowed while the match is active", () => {
    const draft = replay(started(false).slice(0, 1));
    expect(() =>
      decide(draft, { type: "changeRules", ruleToggles: { drawKeepsVeteran: true } }, ctx()),
    ).toThrow(DomainError);
  });

  it("the veteran survives a team size change and still stays on the next draw", () => {
    const afterWin = run(started(true), { type: "win", loserTeamId: "t1" });
    const resized = run(afterWin, { type: "changeTeamSize", teamSize: 3 });
    const state = replay(resized);
    expect(state.teams.map((t) => t.id)).toEqual(["t0", "t2"]);
    expect(state.veteranTeamId).toBe("t0");
    const events = run(resized, { type: "draw" });
    expect(events.at(-1)).toMatchObject({ type: "GAME_WON", loserTeamId: "t2", decidedBy: "draw" });
    expect(replay(events).teams.map((t) => t.id)).toEqual(["t0", "t2"]);
  });

  it("CA-7: undoing the draw restores the previous state, even with a later rule change", () => {
    const afterWin = run(started(true), { type: "win", loserTeamId: "t1" });
    const before = replay(afterWin);
    const drawn = run(afterWin, { type: "draw" });
    const ruleOff = run(drawn, { type: "changeRules", ruleToggles: { drawKeepsVeteran: false } });
    const undone = ruleOff.filter((_, index) => index !== drawn.length - 1);
    expect(replay(undone)).toEqual({
      ...before,
      config: { ...before.config, ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false } },
    });
    expect(replay(ruleOff).teams).toEqual(replay(drawn).teams);
  });
});
