import type { MatchState, Player, Team } from "../types";
import { assignBibs, usedColors } from "./bibs";
import { compactQueue } from "./queue";

function reduceTeamSize(
  state: MatchState,
  teamSize: number,
  createTeamId: () => string,
): MatchState {
  const released: Player[] = [];
  const shrunk = state.teams.map((team) => {
    const keep = team.players.slice(0, teamSize);
    released.push(...team.players.slice(teamSize));
    return { ...team, players: keep };
  });

  const compacted = compactQueue(
    shrunk,
    [...state.queue, ...released],
    teamSize,
    createTeamId,
  );
  return {
    ...state,
    config: { ...state.config, teamSize },
    teams: assignBibs(compacted.teams, state.config.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}

function increaseTeamSize(
  state: MatchState,
  teamSize: number,
  createTeamId: () => string,
): MatchState | null {
  const grow = teamSize - state.config.teamSize;
  let pool = [...state.queue];
  let remaining = [...state.teams];
  const filled: Team[] = [];

  while (remaining.length > 0) {
    while (pool.length < grow && remaining.length - 1 > 0) {
      const last = remaining[remaining.length - 1];
      if (last === undefined) {
        throw new Error("invariant: increaseTeamSize requires a team to dissolve");
      }
      remaining = remaining.slice(0, -1);
      pool = [...pool, ...last.players];
    }
    if (pool.length < grow) {
      return null;
    }
    const team = remaining[0];
    if (team === undefined) {
      throw new Error("invariant: increaseTeamSize requires a team to fill");
    }
    remaining = remaining.slice(1);
    filled.push({ ...team, players: [...team.players, ...pool.slice(0, grow)] });
    pool = pool.slice(grow);
  }

  if (filled.length < 2) {
    return null;
  }

  const compacted = compactQueue(filled, pool, teamSize, createTeamId);
  return {
    ...state,
    config: { ...state.config, teamSize },
    teams: assignBibs(compacted.teams, state.config.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}

export function changeTeamSize(
  state: MatchState,
  teamSize: number,
  createTeamId: () => string,
): MatchState | null {
  if (teamSize < state.config.teamSize) {
    return reduceTeamSize(state, teamSize, createTeamId);
  }
  return increaseTeamSize(state, teamSize, createTeamId);
}
