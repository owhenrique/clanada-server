import { decodeRuleToggles, type Event } from "../../../domain/match";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPlayer(value: unknown): value is { id: string; name: string } {
  return isRecord(value) && isString(value.id) && isString(value.name);
}

function isPlayerArray(value: unknown): value is { id: string; name: string }[] {
  return Array.isArray(value) && value.every(isPlayer);
}

function isMatchConfig(
  value: unknown,
): value is { teamSize: number; colors: string[]; gameMinutes: number; ruleToggles?: unknown } {
  return (
    isRecord(value) &&
    isNumber(value.teamSize) &&
    isStringArray(value.colors) &&
    isNumber(value.gameMinutes)
  );
}

function invalidPayload(type: string): never {
  throw new Error(`invariant: invalid persisted event payload for "${type}"`);
}

type EventDecoder = (payload: Record<string, unknown>) => Event;

const decoders: Record<Event["type"], EventDecoder> = {
  MATCH_CREATED: (p) => {
    if (!isMatchConfig(p.config) || !isPlayerArray(p.players) || !isStringArray(p.teamIds)) {
      invalidPayload("MATCH_CREATED");
    }
    const config = { ...p.config, ruleToggles: decodeRuleToggles(p.config.ruleToggles) };
    return { type: "MATCH_CREATED", config, players: p.players, teamIds: p.teamIds };
  },
  RESHUFFLED: (p) => {
    if (!isStringArray(p.order) || !isStringArray(p.teamIds)) {
      invalidPayload("RESHUFFLED");
    }
    return { type: "RESHUFFLED", order: p.order, teamIds: p.teamIds };
  },
  PLAYERS_SWAPPED: (p) => {
    if (!isString(p.playerAId) || !isString(p.playerBId)) {
      invalidPayload("PLAYERS_SWAPPED");
    }
    return { type: "PLAYERS_SWAPPED", playerAId: p.playerAId, playerBId: p.playerBId };
  },
  MATCH_STARTED: (_p) => ({ type: "MATCH_STARTED" }),
  GAME_WON: (p) => {
    if (
      !isString(p.loserTeamId) ||
      (p.decidedBy !== "match" && p.decidedBy !== "penalties") ||
      !isStringArray(p.newTeamIds)
    ) {
      invalidPayload("GAME_WON");
    }
    return {
      type: "GAME_WON",
      loserTeamId: p.loserTeamId,
      decidedBy: p.decidedBy,
      newTeamIds: p.newTeamIds,
    };
  },
  GAME_DRAWN: (p) => {
    if (!isString(p.firstLeaverTeamId) || !isStringArray(p.newTeamIds)) {
      invalidPayload("GAME_DRAWN");
    }
    return { type: "GAME_DRAWN", firstLeaverTeamId: p.firstLeaverTeamId, newTeamIds: p.newTeamIds };
  },
  PLAYER_JOINED: (p) => {
    if (!isPlayer(p.player) || !isStringArray(p.newTeamIds)) {
      invalidPayload("PLAYER_JOINED");
    }
    return { type: "PLAYER_JOINED", player: p.player, newTeamIds: p.newTeamIds };
  },
  PLAYER_LEFT: (p) => {
    if (
      !isString(p.playerId) ||
      (p.fallback !== "none" && p.fallback !== "reduce-team-size") ||
      !isStringArray(p.newTeamIds)
    ) {
      invalidPayload("PLAYER_LEFT");
    }
    return {
      type: "PLAYER_LEFT",
      playerId: p.playerId,
      fallback: p.fallback,
      newTeamIds: p.newTeamIds,
    };
  },
  TEAM_SIZE_CHANGED: (p) => {
    if (!isNumber(p.teamSize) || !isStringArray(p.newTeamIds)) {
      invalidPayload("TEAM_SIZE_CHANGED");
    }
    return { type: "TEAM_SIZE_CHANGED", teamSize: p.teamSize, newTeamIds: p.newTeamIds };
  },
  MATCH_ENDED: (_p) => ({ type: "MATCH_ENDED" }),
};

export function encodeEventPayload(event: Event): Record<string, unknown> {
  const { type: _type, ...payload } = event;
  return payload;
}

export function decodeEvent(type: string, payload: unknown): Event {
  const decoder = (decoders as Record<string, EventDecoder | undefined>)[type];
  if (decoder === undefined || !isRecord(payload)) {
    throw new Error(`invariant: unknown persisted event type "${type}"`);
  }
  return decoder(payload);
}
