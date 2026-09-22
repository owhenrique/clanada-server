import type { Player, MatchState } from "../types";

export function playerJoins(state: MatchState, player: Player): MatchState {
  return { ...state, queue: [...state.queue, player] };
}
