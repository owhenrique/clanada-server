import { decodeSplitConfig, decodeRuleToggles, type Event, type Player } from "../../../domain/match";

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

function isTeamNames(value: unknown): value is (string | null)[] {
  return Array.isArray(value) && value.every((name) => name === null || isString(name));
}

function isPlayer(value: unknown): value is { id: string; name: string } {
  return isRecord(value) && isString(value.id) && isString(value.name);
}

function isPlayerArray(value: unknown): value is { id: string; name: string }[] {
  return Array.isArray(value) && value.every(isPlayer);
}

function toPlayer(value: { id: string; name: string; arrival?: unknown }): Player {
  const { id, name, arrival } = value;
  return isNumber(arrival) ? { id, name, arrival } : { id, name };
}

function isMatchConfig(value: unknown): value is {
  teamSize: number;
  colors: string[];
  gameMinutes: number;
  ruleToggles?: unknown;
  split?: unknown;
} {
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

function teamNamesField(type: string, value: unknown): { teamNames?: (string | null)[] } {
  if (value === undefined) {
    return {};
  }
  if (!isTeamNames(value)) {
    invalidPayload(type);
  }
  return { teamNames: value };
}

function decodeLineup(type: "MATCH_CREATED" | "MATCH_SET_UP", p: Record<string, unknown>): Event {
  if (!isMatchConfig(p.config) || !isPlayerArray(p.players) || !isStringArray(p.teamIds)) {
    invalidPayload(type);
  }
  const config = {
    ...p.config,
    ruleToggles: decodeRuleToggles(p.config.ruleToggles),
    split: decodeSplitConfig(p.config.split),
  };
  return {
    type,
    config,
    players: p.players.map(toPlayer),
    teamIds: p.teamIds,
    ...teamNamesField(type, p.teamNames),
  };
}

type EventDecoder = (payload: Record<string, unknown>) => Event;

const decoders: Record<Event["type"], EventDecoder> = {
  MATCH_CREATED: (p) => decodeLineup("MATCH_CREATED", p),
  MATCH_SET_UP: (p) => decodeLineup("MATCH_SET_UP", p),
  RESHUFFLED: (p) => {
    if (!isStringArray(p.order) || !isStringArray(p.teamIds)) {
      invalidPayload("RESHUFFLED");
    }
    return {
      type: "RESHUFFLED",
      order: p.order,
      teamIds: p.teamIds,
      ...teamNamesField("RESHUFFLED", p.teamNames),
    };
  },
  PLAYERS_SWAPPED: (p) => {
    if (!isString(p.playerAId) || !isString(p.playerBId)) {
      invalidPayload("PLAYERS_SWAPPED");
    }
    return {
      type: "PLAYERS_SWAPPED",
      playerAId: p.playerAId,
      playerBId: p.playerBId,
    };
  },
  MATCH_STARTED: (_p) => ({ type: "MATCH_STARTED" }),
  GAME_WON: (p) => {
    if (
      !isString(p.loserTeamId) ||
      (p.decidedBy !== "match" && p.decidedBy !== "penalties" && p.decidedBy !== "draw") ||
      !isStringArray(p.newTeamIds)
    ) {
      invalidPayload("GAME_WON");
    }
    return {
      type: "GAME_WON",
      loserTeamId: p.loserTeamId,
      decidedBy: p.decidedBy,
      newTeamIds: p.newTeamIds,
      ...teamNamesField("GAME_WON", p.teamNames),
    };
  },
  GAME_DRAWN: (p) => {
    if (!isString(p.firstLeaverTeamId) || !isStringArray(p.newTeamIds)) {
      invalidPayload("GAME_DRAWN");
    }
    return {
      type: "GAME_DRAWN",
      firstLeaverTeamId: p.firstLeaverTeamId,
      newTeamIds: p.newTeamIds,
      ...teamNamesField("GAME_DRAWN", p.teamNames),
    };
  },
  PLAYER_JOINED: (p) => {
    if (!isPlayer(p.player) || !isStringArray(p.newTeamIds)) {
      invalidPayload("PLAYER_JOINED");
    }
    return {
      type: "PLAYER_JOINED",
      player: toPlayer(p.player),
      newTeamIds: p.newTeamIds,
      ...teamNamesField("PLAYER_JOINED", p.teamNames),
    };
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
      ...teamNamesField("PLAYER_LEFT", p.teamNames),
    };
  },
  TEAM_SIZE_CHANGED: (p) => {
    if (!isNumber(p.teamSize) || !isStringArray(p.newTeamIds)) {
      invalidPayload("TEAM_SIZE_CHANGED");
    }
    return {
      type: "TEAM_SIZE_CHANGED",
      teamSize: p.teamSize,
      newTeamIds: p.newTeamIds,
      ...teamNamesField("TEAM_SIZE_CHANGED", p.teamNames),
    };
  },
  SPLIT_ENABLED: (p) => {
    if (!isNumber(p.hourlyRateCents) || !isNumber(p.durationMinutes)) {
      invalidPayload("SPLIT_ENABLED");
    }
    return {
      type: "SPLIT_ENABLED",
      hourlyRateCents: p.hourlyRateCents,
      durationMinutes: p.durationMinutes,
    };
  },
  RULES_CHANGED: (p) => {
    if (!isRecord(p.ruleToggles)) {
      invalidPayload("RULES_CHANGED");
    }
    return { type: "RULES_CHANGED", ruleToggles: decodeRuleToggles(p.ruleToggles) };
  },
  COLORS_ADDED: (p) => {
    if (!isStringArray(p.colors)) {
      invalidPayload("COLORS_ADDED");
    }
    return { type: "COLORS_ADDED", colors: p.colors };
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
