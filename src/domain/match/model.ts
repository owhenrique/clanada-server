export type RuleToggles = {
  arrivalPriority: boolean;
};

export const DEFAULT_RULE_TOGGLES: RuleToggles = {
  arrivalPriority: true,
};

export const LEGACY_RULE_TOGGLES: RuleToggles = {
  arrivalPriority: false,
};

const RULE_KEYS = Object.keys(DEFAULT_RULE_TOGGLES) as (keyof RuleToggles)[];

export function resolveRuleToggles(partial: Partial<RuleToggles> | undefined): RuleToggles {
  return { ...DEFAULT_RULE_TOGGLES, ...partial };
}

export function decodeRuleToggles(value: unknown): RuleToggles {
  if (typeof value !== "object" || value === null) {
    return LEGACY_RULE_TOGGLES;
  }
  const stored = value as Record<string, unknown>;
  const partial: Partial<RuleToggles> = {};
  for (const key of RULE_KEYS) {
    const flag = stored[key];
    if (typeof flag === "boolean") {
      partial[key] = flag;
    }
  }
  return resolveRuleToggles(partial);
}

export type Player = {
  id: string;
  name: string;
};

export type Team = {
  id: string;
  players: Player[];
  color: string | null;
  gameStreak: number;
};

export type MatchStatus = "DRAFT" | "ACTIVE" | "ENDED";

export type MatchConfig = {
  teamSize: number;
  colors: string[];
  gameMinutes: number;
  ruleToggles: RuleToggles;
};

export type MatchState = {
  status: MatchStatus;
  config: MatchConfig;
  teams: Team[];
  queue: Player[];
};

export type TeamIdFactory = (index: number) => string;

export type DrawOutcome =
  | { type: "swap"; state: MatchState; firstLeaverTeamId: string }
  | { type: "penalties" };

export type MatchCreatedEvent = {
  type: "MATCH_CREATED";
  config: MatchConfig;
  players: Player[];
  teamIds: string[];
};

export type MatchSetUpEvent = Omit<MatchCreatedEvent, "type"> & {
  type: "MATCH_SET_UP";
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
  | MatchSetUpEvent
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

export type CommandContext = {
  random: () => number;
  nextId: () => string;
  timerRunning: boolean;
};

export type CreateMatchConfig = Omit<MatchConfig, "ruleToggles"> & {
  ruleToggles?: Partial<RuleToggles>;
};

export type Command =
  | { type: "create"; playerNames: string[]; config: CreateMatchConfig }
  | { type: "setup"; playerNames: string[]; config: CreateMatchConfig }
  | { type: "reshuffle" }
  | { type: "swap"; playerAId: string; playerBId: string }
  | { type: "start" }
  | { type: "win"; loserTeamId: string }
  | { type: "draw" }
  | { type: "penalties"; loserTeamId: string }
  | { type: "join"; name: string }
  | { type: "leave"; playerId: string; fallback?: "reduce-team-size" }
  | { type: "changeTeamSize"; teamSize: number }
  | { type: "end" };

export type DecideResult = { event: Event } | { penaltiesRequired: true };
