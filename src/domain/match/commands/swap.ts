import { locatePlayer } from "../rules/swap";
import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

function isLocked(current: MatchState, playerId: string, ctx: CommandContext): boolean {
  if (!ctx.timerRunning) {
    return false;
  }
  const location = locatePlayer(current, playerId);
  return location?.kind === "team" && location.teamIndex < 2;
}

export function decideSwap(
  state: MatchState | null,
  command: Extract<Command, { type: "swap" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (
    locatePlayer(current, command.playerAId) === null ||
    locatePlayer(current, command.playerBId) === null
  ) {
    throw new DomainError("PLAYER_NOT_FOUND");
  }
  if (
    isLocked(current, command.playerAId, ctx) ||
    isLocked(current, command.playerBId, ctx)
  ) {
    throw new DomainError("PLAYER_LOCKED");
  }
  return {
    event: {
      type: "PLAYERS_SWAPPED",
      playerAId: command.playerAId,
      playerBId: command.playerBId,
    },
  };
}
