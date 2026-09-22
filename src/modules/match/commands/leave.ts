import { locatePlayer } from "../rules/swap";
import { findDonorIndex, playerLeavesWithReducedTeamSize } from "../rules/leave";
import { recordingIdFactory } from "../id-factory";
import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

function hasDonor(state: MatchState, affectedIndex: number): boolean {
  return findDonorIndex(state.teams.length, affectedIndex) !== null;
}

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

  const needsDonor =
    location.kind === "team" &&
    current.queue.length === 0 &&
    !hasDonor(current, location.teamIndex);

  if (!needsDonor) {
    return {
      event: {
        type: "PLAYER_LEFT",
        playerId: command.playerId,
        fallback: "none",
        newTeamIds: [],
      },
    };
  }

  if (command.fallback !== "reduce-team-size") {
    throw new DomainError("NO_DONOR_AVAILABLE");
  }

  const factory = recordingIdFactory(ctx.nextId);
  playerLeavesWithReducedTeamSize(current, command.playerId, factory.createId);
  return {
    event: {
      type: "PLAYER_LEFT",
      playerId: command.playerId,
      fallback: "reduce-team-size",
      newTeamIds: factory.ids,
    },
  };
}
