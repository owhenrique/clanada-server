import type { Team } from "../types";
import { at } from "./queue";

export function usedColors(teams: Team[]): Set<string> {
  return new Set(
    teams
      .map((team) => team.color)
      .filter((color): color is string => color !== null),
  );
}

export function assignBibs(
  teams: Team[],
  colors: string[],
  previouslyHeldColors: ReadonlySet<string>,
): Team[] {
  const bibCount = colors.length;
  const result = teams.map((team, index) => ({
    ...team,
    color: index < bibCount ? team.color : null,
  }));
  const held = new Set(
    result
      .slice(0, bibCount)
      .map((team) => team.color)
      .filter((color): color is string => color !== null),
  );
  const neverUsed = colors.filter(
    (color) => !held.has(color) && !previouslyHeldColors.has(color),
  );
  const recentlyFreed = colors.filter(
    (color) => !held.has(color) && previouslyHeldColors.has(color),
  );
  const freeColors = [...neverUsed, ...recentlyFreed];
  let freeIndex = 0;
  for (let i = 0; i < result.length && i < bibCount; i++) {
    if (at(result, i).color === null) {
      result[i] = { ...at(result, i), color: at(freeColors, freeIndex) };
      freeIndex++;
    }
  }
  return result;
}
