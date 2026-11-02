import { flattenPlayers } from "./lineup";
import type { MatchState, Team } from "./model";

export function effectiveArrivals(state: MatchState): Map<string, number> {
  return new Map(
    flattenPlayers(state).map((player, index) => [player.id, player.arrival ?? index + 1]),
  );
}

export function nextArrival(state: MatchState): number {
  return Math.max(0, ...effectiveArrivals(state).values()) + 1;
}

function earliestArrival(team: Team, arrivals: Map<string, number>): number {
  return Math.min(...team.players.map((player) => arrivals.get(player.id) ?? Infinity));
}

export function drawStayerId(state: MatchState, onField: readonly [Team, Team]): string {
  const [first, second] = onField;
  if (state.veteranTeamId === first.id || state.veteranTeamId === second.id) {
    return state.veteranTeamId;
  }
  const arrivals = effectiveArrivals(state);
  return earliestArrival(second, arrivals) < earliestArrival(first, arrivals)
    ? second.id
    : first.id;
}
