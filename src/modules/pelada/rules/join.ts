import type { Player, PeladaState } from "../types";

export function playerJoins(state: PeladaState, player: Player): PeladaState {
  return { ...state, queue: [...state.queue, player] };
}
