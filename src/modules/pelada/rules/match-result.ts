import type { Team, Player, PeladaState } from "../types";
import { compactQueue } from "./queue";
import { assignBibs, usedColors } from "./bibs";

export function onFieldTeams(state: PeladaState): [Team, Team] {
  const [first, second] = state.teams;
  if (first === undefined || second === undefined) {
    throw new Error("invariant: onFieldTeams requires at least two teams");
  }
  return [first, second];
}

export function applyResult(
  state: PeladaState,
  loserId: string,
  createTeamId: () => string,
): PeladaState {
  const [first, second] = onFieldTeams(state);
  const loser = first.id === loserId ? first : second;
  const winner = first.id === loserId ? second : first;
  const winnerAfter: Team = { ...winner, matchStreak: winner.matchStreak + 1 };
  const waiting = state.teams.slice(2);

  let teams: Team[];
  let queue: Player[];

  if (state.queue.length === 0) {
    const loserAfter: Team = { ...loser, matchStreak: 0 };
    teams =
      waiting.length > 0
        ? [winnerAfter, ...waiting, loserAfter]
        : [winnerAfter, loserAfter];
    queue = [];
  } else {
    teams = [winnerAfter, ...waiting];
    queue = [...state.queue, ...loser.players];
  }

  const compacted = compactQueue(teams, queue, state.teamSize, createTeamId);
  return {
    ...state,
    teams: assignBibs(compacted.teams, state.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}
