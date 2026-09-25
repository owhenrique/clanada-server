import { describe, it, expect } from "vitest";
import { makePlayers, teamId } from "./test-fixtures";
import {
  formInitialState,
  flattenPlayers,
  orderPlayers,
  decideCreate,
  decideReshuffle,
  decideSetup,
} from "./lineup";
import { shuffle } from "./support";
import { swapPlayers } from "./team-edits";
import type { Player, CommandContext, CreateMatchConfig, Event, MatchConfig, MatchState } from "./model";
import { DomainError } from "../../shared/errors/domain-error";
import { applyEvent, replay } from "./engine";

describe("CEN-1: formInitialState", () => {
  it("forms as many full teams as possible", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(3);
    expect(state.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(state.teams[2]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
    ]);
  });

  it("puts leftover players in the queue, in order", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(2);
    expect(state.queue.map((p) => p.id)).toEqual(["p10", "p11"]);
  });

  it("has no queue when the count is a multiple of the team size", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.queue).toEqual([]);
  });

  it("assigns colors to teams in order", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.color)).toEqual([
      "verde",
      "vermelho",
      "azul",
    ]);
  });

  it("leaves teams without color when there are fewer bibs than teams", () => {
    const state = formInitialState(makePlayers(20), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams).toHaveLength(4);
    expect(state.teams.map((t) => t.color)).toEqual([
      "verde",
      "vermelho",
      "azul",
      null,
    ]);
  });

  it("uses only as many colors as there are teams", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho", "azul", "amarelo"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.color)).toEqual(["verde", "vermelho"]);
  });

  it("assigns team ids from the factory and starts streaks at zero", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(state.teams.every((t) => t.gameStreak === 0)).toBe(true);
  });

  it("keeps the config and starts in DRAFT", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(state.config.teamSize).toBe(5);
    expect(state.config.colors).toEqual(["verde", "vermelho"]);
    expect(state.status).toBe("DRAFT");
  });
});

describe("CEN-1: flattenPlayers", () => {
  it("round-trips through formInitialState: teams in order, then the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const flat = flattenPlayers(state);
    expect(flat.map((p) => p.id)).toEqual(makePlayers(12).map((p) => p.id));
    const rebuilt = formInitialState(flat, { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(rebuilt).toEqual(state);
  });

  it("reflects a swap applied before flattening", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const swapped = swapPlayers(state, "p2", "p11");
    const flat = flattenPlayers(swapped);
    expect(flat.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p11",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p2",
    ]);
  });
});

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}` }));
}

function ids(list: Player[]): string[] {
  return list.map((player) => player.id);
}

const on = { arrivalPriority: true };
const off = { arrivalPriority: false };

describe("orderPlayers", () => {
  it("F4 CEN-1: shuffles only the seated players and keeps the rest in arrival order", () => {
    const order = orderPlayers(players(11), 10, 5, on, () => 0);
    expect(new Set(ids(order.slice(0, 10)))).toEqual(new Set(ids(players(10))));
    expect(ids(order.slice(10))).toEqual(["p11"]);
    expect(ids(order.slice(0, 10))).not.toEqual(ids(players(10)));
  });

  it("F4 CEN-2: keeps several waiting players in arrival order", () => {
    const order = orderPlayers(players(8), 6, 3, on, () => 0);
    expect(ids(order.slice(6))).toEqual(["p7", "p8"]);
  });

  it("F4 CEN-4: shuffles everyone when the rule is off", () => {
    const order = orderPlayers(players(11), 10, 5, off, () => 0);
    expect(ids(order)).toEqual(ids(shuffle(players(11), () => 0)));
  });

  it("F4 CEN-5: with nobody seated, returns the arrival order", () => {
    expect(ids(orderPlayers(players(3), 0, 5, on, () => 0))).toEqual(["p1", "p2", "p3"]);
  });

  it("F6 CEN-1: shuffles only the first 2N seated players and keeps the next teams in arrival order", () => {
    const order = orderPlayers(players(16), 15, 5, on, () => 0);
    expect(new Set(ids(order.slice(0, 10)))).toEqual(new Set(ids(players(10))));
    expect(ids(order.slice(10))).toEqual(ids(players(16).slice(10)));
  });
});

const config: MatchConfig = {
  teamSize: 5,
  colors: ["verde", "vermelho"],
  gameMinutes: 10,
  ruleToggles: { arrivalPriority: false },
};

function ctxFor(playerIds: string[], teamIds: string[]): CommandContext {
  const ids = [...playerIds, ...teamIds];
  let index = 0;
  return {
    random: () => 0,
    nextId: () => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

describe("CEN-1: decideCreate", () => {
  it("shuffles and records every generated id in the event payload", () => {
    const playerNames = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const ctx = ctxFor(
      Array.from({ length: 12 }, (_, i) => `p${i}`),
      ["t0", "t1"],
    );
    const result = decideCreate(null, { type: "create", playerNames, config }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event.type).toBe("MATCH_CREATED");
    if (result.event.type !== "MATCH_CREATED") {
      return;
    }
    expect(result.event.teamIds).toEqual(["t0", "t1"]);
    expect(result.event.players).toHaveLength(12);

    const stateA = applyEvent(null, result.event);
    const stateB = applyEvent(null, result.event);
    expect(stateB).toEqual(stateA);
  });

  it("CEN-2: rejects duplicate names (case/space insensitive)", () => {
    const ctx = ctxFor(["p0", "p1"], ["t0"]);
    expect(() =>
      decideCreate(
        null,
        { type: "create", playerNames: ["Ana", "ana "], config },
        ctx,
      ),
    ).toThrow(DomainError);
    try {
      decideCreate(
        null,
        { type: "create", playerNames: ["Ana", "ana "], config },
        ctxFor(["p0", "p1"], ["t0"]),
      );
    } catch (error) {
      expect((error as DomainError).code).toBe("DUPLICATE_PLAYER_NAMES");
    }
  });
});

function names(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${i + 1}`);
}

function createdState(
  playerNames: string[],
  createConfig: CreateMatchConfig,
  random: () => number,
): MatchState {
  const teamIds = ["t0", "t1", "t2"];
  const ids = [...playerNames.map((name) => `id-${name}`), ...teamIds];
  let index = 0;
  const ctx: CommandContext = {
    random,
    nextId: () => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
  const result = decideCreate(null, { type: "create", playerNames, config: createConfig }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return applyEvent(null, result.event);
}

function teamNames(state: MatchState): string[] {
  return state.teams.flatMap((team) => team.players.map((player) => player.name));
}

function queueNames(state: MatchState): string[] {
  return state.queue.map((player) => player.name);
}

const arrivalOn = { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: true } };
const arrivalOff = { ...arrivalOn, ruleToggles: { arrivalPriority: false } };

describe("arrival priority on create", () => {
  it("F4 CEN-1: keeps the first T×N names on the teams and the rest in the queue", () => {
    const state = createdState(names(11), arrivalOn, () => 0.3);
    expect(new Set(teamNames(state))).toEqual(new Set(names(10)));
    expect(queueNames(state)).toEqual(["p11"]);
  });

  it("F4 CEN-2: keeps the queue in arrival order", () => {
    const state = createdState(names(8), { ...arrivalOn, teamSize: 3 }, () => 0);
    expect(new Set(teamNames(state))).toEqual(new Set(names(6)));
    expect(queueNames(state)).toEqual(["p7", "p8"]);
  });

  it("F4 CEN-3: mixes the players who arrived together", () => {
    const state = createdState(names(10), arrivalOn, () => 0);
    const firstTeam = state.teams[0]?.players.map((player) => player.name) ?? [];
    expect(new Set(firstTeam)).not.toEqual(new Set(names(5)));
  });

  it("F4 CEN-4: shuffles everyone when the rule is off", () => {
    const random = (): number => 0;
    const state = createdState(names(11), arrivalOff, random);
    const expected = shuffle(names(11), random);
    expect([...teamNames(state), ...queueNames(state)]).toEqual(expected);
    expect(queueNames(state)).not.toEqual(["p11"]);
  });

  it("F4 CEN-5: with fewer players than a team, keeps everyone in the queue in arrival order", () => {
    const state = createdState(names(3), arrivalOn, () => 0);
    expect(state.teams).toEqual([]);
    expect(queueNames(state)).toEqual(["p1", "p2", "p3"]);
  });

  it("F4 CEN-10: defaults the rule to on and records the resolved toggles", () => {
    const state = createdState(
      names(11),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
      () => 0,
    );
    expect(state.config.ruleToggles).toEqual({ arrivalPriority: true });
    expect(queueNames(state)).toEqual(["p11"]);
  });
});

function teamNamesAt(state: MatchState, index: number): string[] {
  return state.teams[index]?.players.map((player) => player.name) ?? [];
}

describe("arrival priority puts the first arrivals on the field", () => {
  it("F6 CEN-1: with three teams, the first 2N play first and the next N form the third team in order", () => {
    const state = createdState(names(16), arrivalOn, () => 0.3);
    expect(new Set([...teamNamesAt(state, 0), ...teamNamesAt(state, 1)])).toEqual(new Set(names(10)));
    expect(teamNamesAt(state, 2)).toEqual(["p11", "p12", "p13", "p14", "p15"]);
    expect(queueNames(state)).toEqual(["p16"]);
  });

  it("F6 CEN-2: with two teams, the first 2N play and the rest wait in order", () => {
    const state = createdState(names(13), arrivalOn, () => 0.3);
    expect(new Set(teamNames(state))).toEqual(new Set(names(10)));
    expect(queueNames(state)).toEqual(["p11", "p12", "p13"]);
  });

  it("F6 CEN-3: shuffles the players who go on the field", () => {
    const state = createdState(names(16), arrivalOn, () => 0);
    expect(new Set(teamNamesAt(state, 0))).not.toEqual(new Set(names(5)));
  });

  it("F6 CEN-5: shuffles everyone when the rule is off", () => {
    const random = (): number => 0;
    const state = createdState(names(16), arrivalOff, random);
    expect([...teamNames(state), ...queueNames(state)]).toEqual(shuffle(names(16), random));
  });
});

function draftState(): MatchState {
  return formInitialState(
    makePlayers(12),
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
}

function ctxWithIds(teamIds: string[]): CommandContext {
  let index = 0;
  return {
    random: () => 0.9,
    nextId: () => {
      const id = teamIds[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

describe("CEN-4: decideReshuffle", () => {
  it("reorders the players and records fresh team ids", () => {
    const state = draftState();
    const result = decideReshuffle(state, { type: "reshuffle" }, ctxWithIds(["t2", "t3"]));
    if (!("event" in result) || result.event.type !== "RESHUFFLED") {
      throw new Error("expected a RESHUFFLED event");
    }
    expect(result.event.teamIds).toEqual(["t2", "t3"]);
    expect(result.event.order).toHaveLength(12);
    expect(new Set(result.event.order)).toEqual(
      new Set(makePlayers(12).map((p) => p.id)),
    );
  });
});

function arrivalDraft(arrivalPriority: boolean): MatchState {
  const players = Array.from({ length: 11 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
  }));
  return formInitialState(
    players,
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority } },
    (i) => `t${i}`,
  );
}

function reshuffled(state: MatchState, random: () => number): MatchState {
  const ctx: CommandContext = { ...ctxWithIds(["t2", "t3"]), random };
  const result = decideReshuffle(state, { type: "reshuffle" }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return applyEvent(state, result.event);
}

function teamIds(state: MatchState): string[] {
  return state.teams.flatMap((team) => team.players.map((player) => player.id));
}

const firstTen = Array.from({ length: 10 }, (_, index) => `p${index + 1}`);

describe("arrival priority on reshuffle", () => {
  it("F4 CEN-6: keeps the queue and reshuffles only the players on the teams", () => {
    const state = reshuffled(arrivalDraft(true), () => 0);
    expect(state.queue.map((player) => player.id)).toEqual(["p11"]);
    expect(new Set(teamIds(state))).toEqual(new Set(firstTen));
    const firstTeam = new Set(state.teams[0]?.players.map((player) => player.id));
    expect(firstTeam).not.toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });

  it("F4 CEN-7: respects a manual swap between a team and the queue", () => {
    const swapped = swapPlayers(arrivalDraft(true), "p11", "p10");
    const state = reshuffled(swapped, () => 0);
    expect(teamIds(state)).toContain("p11");
    expect(state.queue.map((player) => player.id)).toEqual(["p10"]);
  });

  it("F4 CEN-8: shuffles everyone when the rule is off", () => {
    const draft = arrivalDraft(false);
    const random = (): number => 0;
    const state = reshuffled(draft, random);
    const expected = shuffle(flattenPlayers(draft), random).map((player) => player.id);
    expect([...teamIds(state), ...state.queue.map((player) => player.id)]).toEqual(expected);
    expect(state.queue.map((player) => player.id)).not.toEqual(["p11"]);
  });
});

function threeTeamDraft(arrivalPriority: boolean): MatchState {
  const players = Array.from({ length: 16 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
  }));
  return formInitialState(
    players,
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority } },
    (i) => `t${i}`,
  );
}

function reshuffledThree(state: MatchState, random: () => number): MatchState {
  const ctx: CommandContext = { ...ctxWithIds(["t3", "t4", "t5"]), random };
  const result = decideReshuffle(state, { type: "reshuffle" }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return applyEvent(state, result.event);
}

function playerIdsAt(state: MatchState, index: number): string[] {
  return state.teams[index]?.players.map((player) => player.id) ?? [];
}

describe("arrival priority reshuffles only the teams on the field", () => {
  it("F6 CEN-4: keeps the third team and the queue untouched", () => {
    const state = reshuffledThree(threeTeamDraft(true), () => 0);
    expect(new Set([...playerIdsAt(state, 0), ...playerIdsAt(state, 1)])).toEqual(new Set(firstTen));
    expect(new Set(playerIdsAt(state, 0))).not.toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
    expect(playerIdsAt(state, 2)).toEqual(["p11", "p12", "p13", "p14", "p15"]);
    expect(state.queue.map((player) => player.id)).toEqual(["p16"]);
  });

  it("F6 CEN-5: shuffles everyone when the rule is off", () => {
    const draft = threeTeamDraft(false);
    const random = (): number => 0;
    const state = reshuffledThree(draft, random);
    const expected = shuffle(flattenPlayers(draft), random).map((player) => player.id);
    expect([...teamIds(state), ...state.queue.map((player) => player.id)]).toEqual(expected);
  });
});

function sequenceCtx(ids: string[], random: () => number): CommandContext {
  let index = 0;
  return {
    random,
    nextId: () => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

function eventOf(result: ReturnType<typeof decideSetup>): Event {
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return result.event;
}

describe("F8: decideSetup", () => {
  const setupIds = [...names(10).map((name) => `s-${name}`), "s-t0", "s-t1", "s-t2"];

  it("CEN-5: reconfigures a draft with a new team size and players, staying in DRAFT", () => {
    const draft = createdState(names(3), arrivalOn, () => 0);
    const event = eventOf(
      decideSetup(
        draft,
        { type: "setup", playerNames: ["A", "B", "C", "D", "E", "F"], config: { ...arrivalOn, teamSize: 3 } },
        sequenceCtx(setupIds, () => 0),
      ),
    );
    expect(event.type).toBe("MATCH_SET_UP");
    const state = applyEvent(draft, event);
    expect(state.status).toBe("DRAFT");
    expect(state.config.teamSize).toBe(3);
    expect(state.teams).toHaveLength(2);
    expect(state.teams.every((team) => team.players.length === 3)).toBe(true);
    expect(state.queue).toEqual([]);
  });

  it("CEN-6: discards manual swaps and forms the same lineup as a create with the same input", () => {
    const draft = createdState(names(10), arrivalOff, () => 0.3);
    const [first, second] = draft.teams;
    if (first === undefined || second === undefined) {
      throw new Error("fixture needs two teams");
    }
    const swapped = swapPlayers(draft, first.players[0]?.id ?? "", second.players[0]?.id ?? "");
    const random = (): number => 0.42;
    const setupState = applyEvent(
      swapped,
      eventOf(decideSetup(swapped, { type: "setup", playerNames: names(10), config: arrivalOff }, sequenceCtx(setupIds, random))),
    );
    const createResult = decideCreate(null, { type: "create", playerNames: names(10), config: arrivalOff }, sequenceCtx(setupIds, random));
    if (!("event" in createResult)) {
      throw new Error("expected an event");
    }
    expect(setupState).toEqual(applyEvent(null, createResult.event));
  });

  it("CEN-9: replay ends in the lineup formed by MATCH_SET_UP", () => {
    const createResult = decideCreate(null, { type: "create", playerNames: names(10), config: arrivalOff }, sequenceCtx(setupIds, () => 0.3));
    if (!("event" in createResult)) {
      throw new Error("expected an event");
    }
    const created = applyEvent(null, createResult.event);
    const [first, second] = created.teams;
    const swapEvent = {
      type: "PLAYERS_SWAPPED" as const,
      playerAId: first?.players[0]?.id ?? "",
      playerBId: second?.players[0]?.id ?? "",
    };
    const swapped = applyEvent(created, swapEvent);
    const setupEvent = eventOf(
      decideSetup(swapped, { type: "setup", playerNames: names(6), config: { ...arrivalOff, teamSize: 3 } }, sequenceCtx(setupIds, () => 0.7)),
    );
    expect(replay([createResult.event, swapEvent, setupEvent])).toEqual(applyEvent(swapped, setupEvent));
    expect(replay([createResult.event, swapEvent, setupEvent]).config.teamSize).toBe(3);
  });
});
