import type { Player, MatchState } from "../types";
import { assignBibs, usedColors } from "./bibs";
import { compactQueue } from "./queue";

export function playerJoins(
  state: MatchState,
  player: Player,
  createTeamId: () => string,
): MatchState {
  const compacted = compactQueue(
    state.teams,
    [...state.queue, player],
    state.config.teamSize,
    createTeamId,
  );
  return {
    ...state,
    teams: assignBibs(compacted.teams, state.config.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}
