import type { Team, MatchState, DrawOutcome } from "../types";
import { compactQueue } from "./queue";
import { assignBibs, usedColors } from "./bibs";
import { onFieldTeams } from "./game-result";

function orderedLeavers(state: MatchState, firstLeaverTeamId: string): [Team, Team] {
  const [first, second] = onFieldTeams(state);
  return first.id === firstLeaverTeamId ? [first, second] : [second, first];
}

export function applyDraw(
  state: MatchState,
  firstLeaverTeamId: string,
  createTeamId: () => string,
): MatchState {
  const waiting = state.teams.slice(2);
  const complete = waiting.filter(
    (team) => team.players.length === state.config.teamSize,
  );
  const entering = complete.slice(0, 2);
  const enteringIds = new Set(entering.map((team) => team.id));
  const remaining = waiting.filter((team) => !enteringIds.has(team.id));
  const leavers = orderedLeavers(state, firstLeaverTeamId);
  const queue = [...state.queue, ...leavers[0].players, ...leavers[1].players];
  const compacted = compactQueue(
    [...entering, ...remaining],
    queue,
    state.config.teamSize,
    createTeamId,
  );
  const teams = assignBibs(
    compacted.teams,
    state.config.colors,
    usedColors(state.teams),
  );
  return { ...state, teams, queue: compacted.queue };
}

export function resolveDraw(
  state: MatchState,
  rng: () => number,
  createTeamId: () => string,
): DrawOutcome {
  const waiting = state.teams.slice(2);
  const complete = waiting.filter(
    (team) => team.players.length === state.config.teamSize,
  );
  if (complete.length < 2) {
    return { type: "penalties" };
  }
  const [first, second] = onFieldTeams(state);
  const firstLeaverTeamId = rng() < 0.5 ? first.id : second.id;
  return {
    type: "swap",
    state: applyDraw(state, firstLeaverTeamId, createTeamId),
    firstLeaverTeamId,
  };
}
