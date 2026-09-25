import { DomainError } from "../../shared/errors/domain-error";
import { requireState, idsFrom } from "./support";
import { formInitialState, flattenPlayers, decideCreate, decideSetup, decideReshuffle } from "./lineup";
import { applyGameResult, applyDraw, decideWin, decideDraw, decidePenalties } from "./game-result";
import { swapPlayers, changeTeamSize, decideSwap, decideChangeTeamSize } from "./team-edits";
import {
  playerJoins,
  playerLeaves,
  playerLeavesWithReducedTeamSize,
  decideJoin,
  decideLeave,
} from "./roster";
import type {
  MatchState,
  MatchStatus,
  Player,
  Event,
  Command,
  CommandContext,
  DecideResult,
} from "./model";

export function decideStart(
  state: MatchState | null,
  _command: Extract<Command, { type: "start" }>,
  _ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (current.teams.length < 2) {
    throw new DomainError("NOT_ENOUGH_TEAMS");
  }
  return { event: { type: "MATCH_STARTED" } };
}

export function decideEnd(
  state: MatchState | null,
  _command: Extract<Command, { type: "end" }>,
  _ctx: CommandContext,
): DecideResult {
  requireState(state);
  return { event: { type: "MATCH_ENDED" } };
}

type CommandHandler = (
  state: MatchState | null,
  command: Command,
  ctx: CommandContext,
) => DecideResult;

const commandHandlers: Record<Command["type"], CommandHandler> = {
  create: decideCreate as CommandHandler,
  setup: decideSetup as CommandHandler,
  reshuffle: decideReshuffle as CommandHandler,
  swap: decideSwap as CommandHandler,
  start: decideStart as CommandHandler,
  win: decideWin as CommandHandler,
  draw: decideDraw as CommandHandler,
  penalties: decidePenalties as CommandHandler,
  join: decideJoin as CommandHandler,
  leave: decideLeave as CommandHandler,
  changeTeamSize: decideChangeTeamSize as CommandHandler,
  end: decideEnd as CommandHandler,
};

const allowedStatus: Record<Command["type"], MatchStatus[] | null> = {
  create: null,
  setup: ["DRAFT"],
  reshuffle: ["DRAFT"],
  swap: ["DRAFT", "ACTIVE"],
  start: ["DRAFT"],
  win: ["ACTIVE"],
  draw: ["ACTIVE"],
  penalties: ["ACTIVE"],
  join: ["ACTIVE"],
  leave: ["ACTIVE"],
  changeTeamSize: ["ACTIVE"],
  end: ["ACTIVE"],
};

export function decide(
  state: MatchState | null,
  command: Command,
  ctx: CommandContext,
): DecideResult {
  const allowed = allowedStatus[command.type];
  if (allowed !== null && (state === null || !allowed.includes(state.status))) {
    throw new DomainError("INVALID_STATUS");
  }
  return commandHandlers[command.type](state, command, ctx);
}

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

function handleMatchSetUp(
  state: MatchState | null,
  event: Extract<Event, { type: "MATCH_SET_UP" }>,
): MatchState {
  requireState(state);
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

const eventHandlers: HandlerMap = {
  MATCH_CREATED: handleMatchCreated,
  MATCH_SET_UP: handleMatchSetUp,
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
  const handler = eventHandlers[event.type] as (
    state: MatchState | null,
    event: Event,
  ) => MatchState;
  return handler(state, event);
}

export function replay(events: readonly Event[]): MatchState {
  const [first, ...rest] = events;
  if (first === undefined || first.type !== "MATCH_CREATED") {
    throw new Error("invariant: replay requires MATCH_CREATED as the first event");
  }
  return rest.reduce<MatchState>(
    (state, event) => applyEvent(state, event),
    applyEvent(null, first),
  );
}
