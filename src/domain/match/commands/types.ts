import type { MatchConfig } from "../types";
import type { RuleToggles } from "../rule-toggles";
import type { Event } from "../events";

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
