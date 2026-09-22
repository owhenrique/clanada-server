import type { Player, PeladaState } from "../types";

export function flattenPlayers(state: PeladaState): Player[] {
  return [...state.teams.flatMap((team) => team.players), ...state.queue];
}
