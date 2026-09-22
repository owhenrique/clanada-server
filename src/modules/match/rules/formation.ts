import type { Player, Team, MatchState, TeamIdFactory } from "../types";

export function formInitialState(
  players: Player[],
  teamSize: number,
  colors: string[],
  teamId: TeamIdFactory,
): MatchState {
  const fullTeams = Math.floor(players.length / teamSize);
  const teams: Team[] = [];
  for (let index = 0; index < fullTeams; index++) {
    const start = index * teamSize;
    teams.push({
      id: teamId(index),
      players: players.slice(start, start + teamSize),
      color: colors[index] ?? null,
      gameStreak: 0,
    });
  }
  const queue = players.slice(fullTeams * teamSize);
  return { teamSize, colors, teams, queue };
}
