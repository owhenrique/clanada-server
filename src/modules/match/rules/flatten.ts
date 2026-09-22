import type { Player, MatchState } from "../types";

export function flattenPlayers(state: MatchState): Player[] {
  return [...state.teams.flatMap((team) => team.players), ...state.queue];
}
