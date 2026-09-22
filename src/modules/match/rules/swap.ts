import type { Player, MatchState, Team } from "../types";
import { at } from "./queue";

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
