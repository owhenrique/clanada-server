import { describe, it, expect } from "vitest";
import { decideCreate } from "./create";
import { applyEvent } from "../apply-event";
import { DomainError } from "../../../shared/errors/domain-error";
import { shuffle } from "../rules/shuffle";
import type { MatchConfig, MatchState } from "../types";
import type { CommandContext, CreateMatchConfig } from "./types";

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
