import { locatePlayer } from "../rules/swap";
import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideLeave(
  state: MatchState | null,
  command: Extract<Command, { type: "leave" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const location = locatePlayer(current, command.playerId);
  if (location === null) {
    throw new DomainError("PLAYER_NOT_FOUND");
  }
  if (ctx.timerRunning && location.kind === "team" && location.teamIndex < 2) {
    throw new DomainError("PLAYER_LOCKED");
  }
  return {
    event: {
      type: "PLAYER_LEFT",
      playerId: command.playerId,
      fallback: "none",
      newTeamIds: [],
    },
  };
}
