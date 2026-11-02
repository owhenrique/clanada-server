import { describe, it, expect } from "vitest";
import { assignTeamNames, drawTeamNames, shuffle } from "./support";
import { DEFAULT_SPLIT_CONFIG } from "./model";
import type { MatchState, Player, Team } from "./model";
import { TEAM_NAMES } from "./team-names";

function seq(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("CEN-6: shuffle", () => {
  it("does not mutate the input", () => {
    const items = ["a", "b", "c", "d"];
    shuffle(items, () => 0);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps all elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    const result = shuffle(items, seq([0.1, 0.7, 0.3, 0.9]));
    expect([...result].sort()).toEqual([...items].sort());
    expect(result).toHaveLength(items.length);
  });

  it("produces a deterministic order for a given rng", () => {
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("returns a single element unchanged", () => {
    expect(shuffle(["a"], () => 0)).toEqual(["a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(shuffle([], () => 0)).toEqual([]);
  });
});

function namedTeam(id: string, name: string | null): Team {
  return { id, name, color: null, gameStreak: 0, players: [] };
}

function namedState(teams: Team[], queue: Player[] = []): MatchState {
  return {
    status: "DRAFT",
    config: {
      teamSize: 5,
      colors: ["verde", "vermelho"],
      gameMinutes: 10,
      ruleToggles: { arrivalPriority: false },
      split: DEFAULT_SPLIT_CONFIG,
    },
    teams,
    queue,
  };
}

describe("assignTeamNames", () => {
  it("keeps the name of existing teams by id and names the new ones in order", () => {
    const previous = namedState([namedTeam("t0", "Atacadão"), namedTeam("t1", "Tatico")]);
    const next = namedState([
      namedTeam("t0", null),
      namedTeam("t1", null),
      namedTeam("t2", null),
      namedTeam("t3", null),
    ]);
    const result = assignTeamNames(previous, next);
    expect(result.teams.map((team) => team.name)).toEqual([
      "Atacadão",
      "Tatico",
      "Assaí",
      "Carrefour",
    ]);
  });

  it("uses the recorded names exactly when the event has them", () => {
    const previous = namedState([namedTeam("t0", "Atacadão"), namedTeam("t1", "Tatico")]);
    const next = namedState([
      namedTeam("t0", null),
      namedTeam("t1", null),
      namedTeam("t2", null),
      namedTeam("t3", null),
    ]);
    const result = assignTeamNames(previous, next, ["Big Box", null]);
    expect(result.teams.map((team) => team.name)).toEqual([
      "Atacadão",
      "Tatico",
      "Big Box",
      null,
    ]);
  });

  it("returns a dissolved team's name to the first new team", () => {
    const previous = namedState([namedTeam("t0", "Atacadão"), namedTeam("t1", "Tatico")]);
    const next = namedState([namedTeam("t1", null), namedTeam("t9", null)]);
    const result = assignTeamNames(previous, next);
    expect(result.teams.map((team) => team.name)).toEqual(["Tatico", "Atacadão"]);
  });

  it("leaves the 21st active team without a name", () => {
    const named = TEAM_NAMES.map((name, index) => namedTeam(`t${index}`, name));
    const previous = namedState(named);
    const next = namedState([...named, namedTeam("extra", null)]);
    const result = assignTeamNames(previous, next);
    expect(result.teams.map((team) => team.name)).toEqual([...TEAM_NAMES, null]);
  });

  it("does nothing when the event creates no teams", () => {
    const previous = namedState([namedTeam("t0", "Atacadão")]);
    expect(assignTeamNames(previous, previous)).toBe(previous);
  });
});

describe("drawTeamNames", () => {
  it("draws unique free names for the new teams with the injected random", () => {
    const previous = namedState([namedTeam("t0", "Atacadão"), namedTeam("t1", "Tatico")]);
    const next = namedState([
      namedTeam("t0", "Atacadão"),
      namedTeam("t1", "Tatico"),
      namedTeam("t2", null),
      namedTeam("t3", null),
    ]);
    let calls = 0;
    const random = (): number => {
      calls++;
      return 0;
    };
    expect(drawTeamNames(previous, next, random)).toEqual(["Assaí", "Carrefour"]);
    expect(calls).toBe(2);
  });

  it("excludes the names of the surviving teams", () => {
    const previous = namedState([namedTeam("t0", "Big Box")]);
    const next = namedState([
      namedTeam("t0", "Big Box"),
      namedTeam("t2", null),
      namedTeam("t3", null),
    ]);
    expect(drawTeamNames(previous, next, () => 0)).toEqual(["Atacadão", "Tatico"]);
  });

  it("returns null for the 21st active team without consuming random", () => {
    const named = TEAM_NAMES.map((name, index) => namedTeam(`t${index}`, name));
    const previous = namedState(named);
    const next = namedState([...named, namedTeam("extra", null)]);
    let calls = 0;
    const random = (): number => {
      calls++;
      return 0;
    };
    expect(drawTeamNames(previous, next, random)).toEqual([null]);
    expect(calls).toBe(0);
  });
});
