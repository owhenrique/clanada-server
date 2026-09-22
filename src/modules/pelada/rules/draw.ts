import type { Team, PeladaState, DrawOutcome } from "../types";
import { compactQueue } from "./queue";
import { assignBibs, usedColors } from "./bibs";
import { onFieldTeams } from "./match-result";

export function resolveDraw(
  state: PeladaState,
  rng: () => number,
  createTeamId: () => string,
): DrawOutcome {
  const waiting = state.teams.slice(2);
  const complete = waiting.filter(
    (team) => team.players.length === state.teamSize,
  );
  if (complete.length < 2) {
    return { type: "penalties" };
  }
  const entering = complete.slice(0, 2);
  const enteringIds = new Set(entering.map((team) => team.id));
  const remaining = waiting.filter((team) => !enteringIds.has(team.id));
  const [first, second] = onFieldTeams(state);
  const leavers: [Team, Team] = rng() < 0.5 ? [first, second] : [second, first];
  const queue = [...state.queue, ...leavers[0].players, ...leavers[1].players];
  const compacted = compactQueue(
    [...entering, ...remaining],
    queue,
    state.teamSize,
    createTeamId,
  );
  const teams = assignBibs(
    compacted.teams,
    state.colors,
    usedColors(state.teams),
  );
  return { type: "swap", state: { ...state, teams, queue: compacted.queue } };
}
