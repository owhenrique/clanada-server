import { DomainError } from "../../shared/errors/domain-error";
import { at, requireState, recordingIdFactory } from "./support";
import { compactQueue, assignBibs, usedColors } from "./lineup";
import type { Player, Team, MatchState, Command, CommandContext, DecideResult } from "./model";

type PlayerLocation =
  | { kind: "team"; teamIndex: number; playerIndex: number }
  | { kind: "queue"; playerIndex: number };

export function locatePlayer(
  state: MatchState,
  playerId: string,
): PlayerLocation | null {
  for (let teamIndex = 0; teamIndex < state.teams.length; teamIndex++) {
    const team = at(state.teams, teamIndex);
    const playerIndex = team.players.findIndex(
      (player) => player.id === playerId,
    );
    if (playerIndex !== -1) {
      return { kind: "team", teamIndex, playerIndex };
    }
  }
  const playerIndex = state.queue.findIndex((player) => player.id === playerId);
  return playerIndex !== -1 ? { kind: "queue", playerIndex } : null;
}

function playerAtLocation(state: MatchState, location: PlayerLocation): Player {
  return location.kind === "team"
    ? at(at(state.teams, location.teamIndex).players, location.playerIndex)
    : at(state.queue, location.playerIndex);
}

function withPlayerAtLocation(
  teams: Team[],
  queue: Player[],
  location: PlayerLocation,
  player: Player,
): { teams: Team[]; queue: Player[] } {
  if (location.kind === "team") {
    const nextTeams = teams.map((team, index) =>
      index === location.teamIndex
        ? {
            ...team,
            players: team.players.map((current, playerIndex) =>
              playerIndex === location.playerIndex ? player : current,
            ),
          }
        : team,
    );
    return { teams: nextTeams, queue };
  }
  const nextQueue = queue.map((current, playerIndex) =>
    playerIndex === location.playerIndex ? player : current,
  );
  return { teams, queue: nextQueue };
}

export function swapPlayers(
  state: MatchState,
  playerAId: string,
  playerBId: string,
): MatchState {
  if (playerAId === playerBId) {
    return state;
  }
  const locationA = locatePlayer(state, playerAId);
  const locationB = locatePlayer(state, playerBId);
  if (locationA === null || locationB === null) {
    return state;
  }
  const playerA = playerAtLocation(state, locationA);
  const playerB = playerAtLocation(state, locationB);
  const afterA = withPlayerAtLocation(state.teams, state.queue, locationA, playerB);
  const afterB = withPlayerAtLocation(afterA.teams, afterA.queue, locationB, playerA);
  return { ...state, teams: afterB.teams, queue: afterB.queue };
}

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

function isLocked(current: MatchState, playerId: string, ctx: CommandContext): boolean {
  if (!ctx.timerRunning) {
    return false;
  }
  const location = locatePlayer(current, playerId);
  return location?.kind === "team" && location.teamIndex < 2;
}

export function decideSwap(
  state: MatchState | null,
  command: Extract<Command, { type: "swap" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (
    locatePlayer(current, command.playerAId) === null ||
    locatePlayer(current, command.playerBId) === null
  ) {
    throw new DomainError("PLAYER_NOT_FOUND");
  }
  if (
    isLocked(current, command.playerAId, ctx) ||
    isLocked(current, command.playerBId, ctx)
  ) {
    throw new DomainError("PLAYER_LOCKED");
  }
  return {
    event: {
      type: "PLAYERS_SWAPPED",
      playerAId: command.playerAId,
      playerBId: command.playerBId,
    },
  };
}

export function decideChangeTeamSize(
  state: MatchState | null,
  command: Extract<Command, { type: "changeTeamSize" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (command.teamSize < 1 || command.teamSize === current.config.teamSize) {
    throw new DomainError("TEAM_SIZE_NOT_ALLOWED");
  }
  if (ctx.timerRunning) {
    throw new DomainError("TIMER_RUNNING");
  }

  const factory = recordingIdFactory(ctx.nextId);
  const result = changeTeamSize(current, command.teamSize, factory.createId);
  if (result === null) {
    throw new DomainError("TEAM_SIZE_NOT_ALLOWED");
  }
  return {
    event: {
      type: "TEAM_SIZE_CHANGED",
      teamSize: command.teamSize,
      newTeamIds: factory.ids,
    },
  };
}
