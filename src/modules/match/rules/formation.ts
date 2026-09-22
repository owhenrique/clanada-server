import type { Player, Team, MatchState, MatchConfig, TeamIdFactory } from "../types";

export function fullTeamCount(playerCount: number, teamSize: number): number {
  return Math.floor(playerCount / teamSize);
}

export function formInitialState(
  players: Player[],
  config: MatchConfig,
  teamId: TeamIdFactory,
): MatchState {
  const fullTeams = fullTeamCount(players.length, config.teamSize);
  const teams: Team[] = [];
  for (let index = 0; index < fullTeams; index++) {
    const start = index * config.teamSize;
    teams.push({
      id: teamId(index),
      players: players.slice(start, start + config.teamSize),
      color: config.colors[index] ?? null,
      gameStreak: 0,
    });
  }
  const queue = players.slice(fullTeams * config.teamSize);
  return { status: "DRAFT", config, teams, queue };
}
