export type {
  Player,
  Team,
  MatchState,
  MatchStatus,
  MatchConfig,
  TeamIdFactory,
  DrawOutcome,
} from "./types";
export { formInitialState } from "./rules/formation";
export { compactQueue } from "./rules/queue";
export { applyGameResult } from "./rules/game-result";
export { resolveDraw, applyDraw } from "./rules/draw";
export { playerJoins } from "./rules/join";
export { playerLeaves, playerLeavesWithReducedTeamSize } from "./rules/leave";
export { swapPlayers } from "./rules/swap";
export { shuffle } from "./rules/shuffle";
export { flattenPlayers } from "./rules/flatten";
export { changeTeamSize } from "./rules/team-size";
export { normalizeName, duplicateGroups, hasUnresolvedDuplicates } from "./players";
export type { Event } from "./events";
export { UNDOABLE_EVENTS } from "./events";
export { applyEvent } from "./apply-event";
export { replay } from "./replay";
export { assertValidState, InvariantViolation } from "./invariants";
export type { InvariantRule } from "./invariants";
export { decide } from "./commands";
export type { Command, CommandContext, DecideResult } from "./commands/types";
