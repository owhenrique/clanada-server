import { DomainError } from "../../shared/errors/domain-error";
import { at, requireState, recordingIdFactory } from "./support";
import { normalizeName } from "./players";
import { compactQueue, assignBibs, usedColors } from "./lineup";
import { locatePlayer } from "./team-edits";
import type { Player, MatchState, Command, CommandContext, DecideResult } from "./model";

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

export function findDonorIndex(
  teamCount: number,
  affectedIndex: number,
): number | null {
  for (let step = 1; step < teamCount; step++) {
    const index = (affectedIndex + step) % teamCount;
    if (index >= 2 && index !== affectedIndex) {
      return index;
    }
  }
  return null;
}

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
      teams: assignBibs(teams, state.config.colors, usedColors(state.teams)),
      queue: restQueue,
    };
  }

  const donorIndex = findDonorIndex(state.teams.length, affectedIndex);
  if (donorIndex === null) {
    throw new Error("invariant: playerLeaves requires an available donor here");
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
    teams: assignBibs(teams, state.config.colors, usedColors(state.teams)),
    queue: donorRest,
  };
}

export function playerLeavesWithReducedTeamSize(
  state: MatchState,
  playerId: string,
  createTeamId: () => string,
): MatchState {
  const affectedIndex = state.teams.findIndex((team) =>
    team.players.some((player) => player.id === playerId),
  );
  if (affectedIndex === -1) {
    return state;
  }

  const newTeamSize = state.config.teamSize - 1;
  const released: MatchState["queue"] = [];
  const shrunk = state.teams.map((team, index) => {
    const players = team.players.filter((player) => player.id !== playerId);
    if (index !== affectedIndex) {
      const last = players[players.length - 1];
      if (last !== undefined) {
        released.push(last);
      }
      return { ...team, players: players.slice(0, -1) };
    }
    return { ...team, players };
  });

  const config = { ...state.config, teamSize: newTeamSize };
  const compacted = compactQueue(
    shrunk,
    [...state.queue, ...released],
    newTeamSize,
    createTeamId,
  );
  return {
    ...state,
    config,
    teams: assignBibs(compacted.teams, state.config.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}

export function decideJoin(
  state: MatchState | null,
  command: Extract<Command, { type: "join" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const player = { id: ctx.nextId(), name: normalizeName(command.name) };
  const factory = recordingIdFactory(ctx.nextId);
  playerJoins(current, player, factory.createId);
  return {
    event: {
      type: "PLAYER_JOINED",
      player,
      newTeamIds: factory.ids,
    },
  };
}

function hasDonor(state: MatchState, affectedIndex: number): boolean {
  return findDonorIndex(state.teams.length, affectedIndex) !== null;
}

export function decideLeave(
  state: MatchState | null,
  command: Extract<Command, { type: "leave" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const location = locatePlayer(current, command.playerId);
  if (location === null) {
    throw new DomainError("PLAYER_NOT_FOUND");
  }
  if (ctx.timerRunning && location.kind === "team" && location.teamIndex < 2) {
    throw new DomainError("PLAYER_LOCKED");
  }

  const needsDonor =
    location.kind === "team" &&
    current.queue.length === 0 &&
    !hasDonor(current, location.teamIndex);

  if (!needsDonor) {
    return {
      event: {
        type: "PLAYER_LEFT",
        playerId: command.playerId,
        fallback: "none",
        newTeamIds: [],
      },
    };
  }

  if (command.fallback !== "reduce-team-size") {
    throw new DomainError("NO_DONOR_AVAILABLE");
  }

  const factory = recordingIdFactory(ctx.nextId);
  playerLeavesWithReducedTeamSize(current, command.playerId, factory.createId);
  return {
    event: {
      type: "PLAYER_LEFT",
      playerId: command.playerId,
      fallback: "reduce-team-size",
      newTeamIds: factory.ids,
    },
  };
}
