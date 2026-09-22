import type { Team, Player } from "../types";

export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`invariant: index ${index} out of bounds`);
  }
  return value;
}

export function compactQueue(
  teams: Team[],
  queue: Player[],
  teamSize: number,
  createTeamId: () => string,
): { teams: Team[]; queue: Player[] } {
  const result = [...teams];
  let remaining = queue;
  while (remaining.length >= teamSize) {
    result.push({
      id: createTeamId(),
      players: remaining.slice(0, teamSize),
      color: null,
      matchStreak: 0,
    });
    remaining = remaining.slice(teamSize);
  }
  return { teams: result, queue: remaining };
}
