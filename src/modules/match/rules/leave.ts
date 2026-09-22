import type { MatchState } from "../types";
import { assignBibs, usedColors } from "./bibs";
import { at } from "./queue";

export function playerLeaves(state: MatchState, playerId: string): MatchState {
  if (state.queue.some((player) => player.id === playerId)) {
    return {
      ...state,
      queue: state.queue.filter((player) => player.id !== playerId),
    };
  }

  const affectedIndex = state.teams.findIndex((team) =>
    team.players.some((player) => player.id === playerId),
  );
  if (affectedIndex === -1) {
    return state;
  }

  const affected = at(state.teams, affectedIndex);
  const withoutPlayer = affected.players.filter(
    (player) => player.id !== playerId,
  );

  if (state.queue.length > 0) {
    const [replacement, ...restQueue] = state.queue;
    if (replacement === undefined) {
      throw new Error("invariant: playerLeaves requires a non-empty queue here");
    }
    const teams = state.teams.map((team, index) =>
      index === affectedIndex
        ? { ...team, players: [...withoutPlayer, replacement] }
        : team,
    );
    return {
      ...state,
      teams: assignBibs(teams, state.colors, usedColors(state.teams)),
      queue: restQueue,
    };
  }

  const donorIndex =
    affectedIndex + 1 < state.teams.length
      ? affectedIndex + 1
      : affectedIndex - 1;

  if (donorIndex < 0) {
    const teams = state.teams.map((team, index) =>
      index === affectedIndex ? { ...team, players: withoutPlayer } : team,
    );
    return {
      ...state,
      teams: assignBibs(teams, state.colors, usedColors(state.teams)),
    };
  }

  const donor = at(state.teams, donorIndex);
  const [donated, ...donorRest] = donor.players;
  if (donated === undefined) {
    throw new Error("invariant: playerLeaves requires a non-empty donor team");
  }
  const teams = state.teams
    .map((team, index) =>
      index === affectedIndex
        ? { ...team, players: [...withoutPlayer, donated] }
        : team,
    )
    .filter((_, index) => index !== donorIndex);

  return {
    ...state,
    teams: assignBibs(teams, state.colors, usedColors(state.teams)),
    queue: donorRest,
  };
}
