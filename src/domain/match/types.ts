export type { Player } from "./players";
import type { Player } from "./players";
import type { RuleToggles } from "./rule-toggles";

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
