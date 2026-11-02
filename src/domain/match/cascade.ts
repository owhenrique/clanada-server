import { DomainError } from "../../shared/errors/domain-error";
import { at, requireState } from "./support";
import { effectiveArrivals } from "./arrival";
import { locatePlayer, type PlayerLocation } from "./team-edits";
import type {
  Player,
  Team,
  MatchState,
  Command,
  CommandContext,
  DecideResult,
} from "./model";

type Arrivals = Map<string, number>;

function arrivalOf(player: Player, arrivals: Arrivals): number {
  return arrivals.get(player.id) ?? Infinity;
}

function insertByArrival(
  players: readonly Player[],
  player: Player,
  arrivals: Arrivals,
): Player[] {
  const arrival = arrivalOf(player, arrivals);
  const index = players.findIndex(
    (current) => arrivalOf(current, arrivals) > arrival,
  );
  const position = index === -1 ? players.length : index;
  return [...players.slice(0, position), player, ...players.slice(position)];
}

function leaverIndex(
  players: readonly Player[],
  arrivals: Arrivals,
  latest: boolean,
): number {
  let chosen = 0;
  players.forEach((player, index) => {
    const arrival = arrivalOf(player, arrivals);
    const best = arrivalOf(at(players, chosen), arrivals);
    if (latest ? arrival >= best : arrival < best) {
      chosen = index;
    }
  });
  return chosen;
}

function cascadeRange(
  state: MatchState,
  location: PlayerLocation,
  targetIndex: number,
): number[] {
  const endIndex =
    location.kind === "team" ? location.teamIndex : state.teams.length - 1;
  const step = endIndex >= targetIndex ? 1 : -1;
  const range: number[] = [];
  for (let index = targetIndex; index !== endIndex + step; index += step) {
    range.push(index);
  }
  return range;
}

export function cascadePlayer(
  state: MatchState,
  playerId: string,
  targetTeamId: string,
): MatchState {
  const location = locatePlayer(state, playerId);
  const targetIndex = state.teams.findIndex((team) => team.id === targetTeamId);
  if (location === null || targetIndex === -1) {
    return state;
  }
  const arrivals = effectiveArrivals(state);
  const range = cascadeRange(state, location, targetIndex);
  const latest = location.kind === "queue" || location.teamIndex > targetIndex;
  const without = (players: readonly Player[]): Player[] =>
    players.filter((player) => player.id !== playerId);

  const teams: Team[] = state.teams.map((team) => ({
    ...team,
    players: without(team.players),
  }));
  const origin =
    location.kind === "queue"
      ? state.queue
      : at(state.teams, location.teamIndex).players;
  let carried = at(origin, location.playerIndex);
  for (const index of range) {
    const team = at(teams, index);
    if (location.kind === "team" && index === location.teamIndex) {
      teams[index] = {
        ...team,
        players: insertByArrival(team.players, carried, arrivals),
      };
      return { ...state, teams };
    }
    const leaving = leaverIndex(team.players, arrivals, latest);
    const leaver = at(team.players, leaving);
    const remaining = team.players.filter(
      (_, playerIndex) => playerIndex !== leaving,
    );
    teams[index] = {
      ...team,
      players: insertByArrival(remaining, carried, arrivals),
    };
    carried = leaver;
  }
  return {
    ...state,
    teams,
    queue: insertByArrival(without(state.queue), carried, arrivals),
  };
}

export function decideCascade(
  state: MatchState | null,
  command: Extract<Command, { type: "cascade" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const location = locatePlayer(current, command.playerId);
  if (location === null) {
    throw new DomainError("PLAYER_NOT_FOUND");
  }
  const targetIndex = current.teams.findIndex(
    (team) => team.id === command.targetTeamId,
  );
  if (
    targetIndex === -1 ||
    (location.kind === "team" && location.teamIndex === targetIndex)
  ) {
    throw new DomainError("CASCADE_NOT_ALLOWED");
  }
  const range = cascadeRange(current, location, targetIndex);
  if (ctx.timerRunning && range.some((index) => index < 2)) {
    throw new DomainError("PLAYER_LOCKED");
  }
  return {
    event: {
      type: "PLAYER_CASCADED",
      playerId: command.playerId,
      targetTeamId: command.targetTeamId,
    },
  };
}
