import { describe, it, expect } from "vitest";
import type { Team } from "./model";
import { TEAM_NAMES, firstFreeName, pickFreeName, usedTeamNames } from "./team-names";

const EXPECTED_NAMES = [
  "Atacadão",
  "Tatico",
  "Assaí",
  "Carrefour",
  "Extra",
  "Pão de Açúcar",
  "Makro",
  "Sam's Club",
  "Dia",
  "Mateus",
  "Guanabara",
  "Zona Sul",
  "Prezunic",
  "Savegnago",
  "Angeloni",
  "Condor",
  "Muffato",
  "Bretas",
  "Comper",
  "Big Box",
];

function namedTeam(id: string, name: string | null): Team {
  return { id, name, color: null, gameStreak: 0, players: [] };
}

function allNamesUsed(): Set<string> {
  return usedTeamNames(TEAM_NAMES.map((name, index) => namedTeam(`t${index}`, name)));
}

describe("TEAM_NAMES", () => {
  it("has exactly the 20 market names in order", () => {
    expect(TEAM_NAMES).toEqual(EXPECTED_NAMES);
  });

  it("has no duplicate names", () => {
    expect(new Set(TEAM_NAMES).size).toBe(20);
  });
});

describe("firstFreeName", () => {
  it("returns the first name not used by any active team", () => {
    const used = usedTeamNames([namedTeam("t0", "Atacadão"), namedTeam("t1", "Tatico")]);
    expect(firstFreeName(used)).toBe("Assaí");
  });

  it("ignores teams without a name", () => {
    expect(firstFreeName(usedTeamNames([namedTeam("t0", null)]))).toBe("Atacadão");
  });

  it("returns null when every name is taken", () => {
    expect(firstFreeName(allNamesUsed())).toBeNull();
  });
});

describe("pickFreeName", () => {
  it("picks from the free names with the injected random", () => {
    const used = usedTeamNames([namedTeam("t0", "Atacadão")]);
    expect(pickFreeName(used, () => 0)).toBe("Tatico");
  });

  it("returns null without consuming random when every name is taken", () => {
    let calls = 0;
    const random = (): number => {
      calls++;
      return 0.5;
    };
    expect(pickFreeName(allNamesUsed(), random)).toBeNull();
    expect(calls).toBe(0);
  });
});
