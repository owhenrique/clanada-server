import type { MatchState, Player } from "./types";
import type { Event } from "./events";
import { requireState } from "./require-state";
import { idsFrom } from "./id-factory";
import { formInitialState } from "./rules/formation";
import { flattenPlayers } from "./rules/flatten";
import { applyGameResult } from "./rules/game-result";
import { applyDraw } from "./rules/draw";
import { playerJoins } from "./rules/join";
import { playerLeaves, playerLeavesWithReducedTeamSize } from "./rules/leave";
import { swapPlayers } from "./rules/swap";
import { changeTeamSize } from "./rules/team-size";

function reorderByIds(players: readonly Player[], order: readonly string[]): Player[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return order.map((id) => {
    const player = byId.get(id);
    if (player === undefined) {
      throw new Error(`invariant: reorderByIds is missing player ${id}`);
    }
    return player;
  });
}

function handleMatchCreated(
  _state: MatchState | null,
  event: Extract<Event, { type: "MATCH_CREATED" }>,
): MatchState {
  return formInitialState(event.players, event.config, idsFrom(event.teamIds));
}

function handleReshuffled(
  state: MatchState | null,
  event: Extract<Event, { type: "RESHUFFLED" }>,
): MatchState {
  const current = requireState(state);
  const players = reorderByIds(flattenPlayers(current), event.order);
  return formInitialState(players, current.config, idsFrom(event.teamIds));
}

function handlePlayersSwapped(
  state: MatchState | null,
  event: Extract<Event, { type: "PLAYERS_SWAPPED" }>,
): MatchState {
  const current = requireState(state);
  return swapPlayers(current, event.playerAId, event.playerBId);
}

function handleMatchStarted(state: MatchState | null): MatchState {
  return { ...requireState(state), status: "ACTIVE" };
}

function handleGameWon(
  state: MatchState | null,
  event: Extract<Event, { type: "GAME_WON" }>,
): MatchState {
  const current = requireState(state);
  return applyGameResult(current, event.loserTeamId, idsFrom(event.newTeamIds));
}

function handleGameDrawn(
  state: MatchState | null,
  event: Extract<Event, { type: "GAME_DRAWN" }>,
): MatchState {
  const current = requireState(state);
  return applyDraw(current, event.firstLeaverTeamId, idsFrom(event.newTeamIds));
}

function handlePlayerJoined(
  state: MatchState | null,
  event: Extract<Event, { type: "PLAYER_JOINED" }>,
): MatchState {
  return playerJoins(requireState(state), event.player, idsFrom(event.newTeamIds));
}

function handlePlayerLeft(
  state: MatchState | null,
  event: Extract<Event, { type: "PLAYER_LEFT" }>,
): MatchState {
  const current = requireState(state);
  if (event.fallback === "none") {
    return playerLeaves(current, event.playerId);
  }
  return playerLeavesWithReducedTeamSize(
    current,
    event.playerId,
    idsFrom(event.newTeamIds),
  );
}

function handleTeamSizeChanged(
  state: MatchState | null,
  event: Extract<Event, { type: "TEAM_SIZE_CHANGED" }>,
): MatchState {
  const result = changeTeamSize(
    requireState(state),
    event.teamSize,
    idsFrom(event.newTeamIds),
  );
  if (result === null) {
    throw new Error("invariant: replaying TEAM_SIZE_CHANGED must always succeed");
  }
  return result;
}

function handleMatchEnded(state: MatchState | null): MatchState {
  return { ...requireState(state), status: "ENDED" };
}

type HandlerMap = {
  [K in Event["type"]]: (
    state: MatchState | null,
    event: Extract<Event, { type: K }>,
  ) => MatchState;
};

const handlers: HandlerMap = {
  MATCH_CREATED: handleMatchCreated,
  RESHUFFLED: handleReshuffled,
  PLAYERS_SWAPPED: handlePlayersSwapped,
  MATCH_STARTED: handleMatchStarted,
  GAME_WON: handleGameWon,
  GAME_DRAWN: handleGameDrawn,
  PLAYER_JOINED: handlePlayerJoined,
  PLAYER_LEFT: handlePlayerLeft,
  TEAM_SIZE_CHANGED: handleTeamSizeChanged,
  MATCH_ENDED: handleMatchEnded,
};

export function applyEvent(state: MatchState | null, event: Event): MatchState {
  const handler = handlers[event.type] as (
    state: MatchState | null,
    event: Event,
  ) => MatchState;
  return handler(state, event);
}
