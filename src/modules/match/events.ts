import type { Player, MatchConfig } from "./types";

export type MatchCreatedEvent = {
  type: "MATCH_CREATED";
  config: MatchConfig;
  players: Player[];
  teamIds: string[];
};

export type ReshuffledEvent = {
  type: "RESHUFFLED";
  order: string[];
  teamIds: string[];
};

export type PlayersSwappedEvent = {
  type: "PLAYERS_SWAPPED";
  playerAId: string;
  playerBId: string;
};

export type MatchStartedEvent = { type: "MATCH_STARTED" };

export type GameWonEvent = {
  type: "GAME_WON";
  loserTeamId: string;
  decidedBy: "match" | "penalties";
  newTeamIds: string[];
};

export type GameDrawnEvent = {
  type: "GAME_DRAWN";
  firstLeaverTeamId: string;
  newTeamIds: string[];
};

export type PlayerJoinedEvent = {
  type: "PLAYER_JOINED";
  player: Player;
  newTeamIds: string[];
};

export type PlayerLeftEvent = {
  type: "PLAYER_LEFT";
  playerId: string;
  fallback: "none" | "reduce-team-size";
  newTeamIds: string[];
};

export type TeamSizeChangedEvent = {
  type: "TEAM_SIZE_CHANGED";
  teamSize: number;
  newTeamIds: string[];
};

export type MatchEndedEvent = { type: "MATCH_ENDED" };

export type Event =
  | MatchCreatedEvent
  | ReshuffledEvent
  | PlayersSwappedEvent
  | MatchStartedEvent
  | GameWonEvent
  | GameDrawnEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | TeamSizeChangedEvent
  | MatchEndedEvent;

export const UNDOABLE_EVENTS: ReadonlySet<Event["type"]> = new Set([
  "PLAYERS_SWAPPED",
  "GAME_WON",
  "GAME_DRAWN",
  "PLAYER_JOINED",
  "PLAYER_LEFT",
  "TEAM_SIZE_CHANGED",
]);
