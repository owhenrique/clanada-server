export type {
  Player,
  Team,
  MatchState,
  MatchStatus,
  MatchConfig,
  TeamIdFactory,
  DrawOutcome,
} from "./model";
export { formInitialState } from "./lineup";
export { compactQueue } from "./lineup";
export { applyGameResult } from "./game-result";
export { resolveDraw, applyDraw } from "./game-result";
export { playerJoins } from "./roster";
export { playerLeaves, playerLeavesWithReducedTeamSize } from "./roster";
export { swapPlayers } from "./team-edits";
export { shuffle } from "./support";
export { flattenPlayers } from "./lineup";
export { changeTeamSize } from "./team-edits";
export { normalizeName, duplicateGroups, hasUnresolvedDuplicates } from "./players";
export type { Event } from "./model";
export { UNDOABLE_EVENTS } from "./model";
export { applyEvent } from "./engine";
export { replay } from "./engine";
export { projectGameHistory } from "./game-history";
export type { GameOutcome, GameRecord, GameTeamRecord, HistoryEvent } from "./game-history";
export { assertValidState, InvariantViolation } from "./invariants";
export type { InvariantRule } from "./invariants";
export { decide } from "./engine";
export type { Command, CommandContext, CreateMatchConfig, DecideResult } from "./model";
export type { RuleToggles } from "./model";
export { decodeRuleToggles } from "./model";
