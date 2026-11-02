import type { Team } from "./model";

export const TEAM_NAMES: readonly string[] = [
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

export function usedTeamNames(teams: readonly Team[]): Set<string> {
  const names = new Set<string>();
  for (const team of teams) {
    if (typeof team.name === "string") {
      names.add(team.name);
    }
  }
  return names;
}

export function firstFreeName(used: ReadonlySet<string>): string | null {
  return TEAM_NAMES.find((name) => !used.has(name)) ?? null;
}

export function pickFreeName(used: ReadonlySet<string>, rng: () => number): string | null {
  const free = TEAM_NAMES.filter((name) => !used.has(name));
  if (free.length === 0) {
    return null;
  }
  return free[Math.floor(rng() * free.length)] ?? null;
}
