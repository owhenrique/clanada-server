import { changeTeamSize } from "../rules/team-size";
import { recordingIdFactory } from "../id-factory";
import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideChangeTeamSize(
  state: MatchState | null,
  command: Extract<Command, { type: "changeTeamSize" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (command.teamSize < 1 || command.teamSize === current.config.teamSize) {
    throw new DomainError("TEAM_SIZE_NOT_ALLOWED");
  }
  if (ctx.timerRunning) {
    throw new DomainError("TIMER_RUNNING");
  }

  const factory = recordingIdFactory(ctx.nextId);
  const result = changeTeamSize(current, command.teamSize, factory.createId);
  if (result === null) {
    throw new DomainError("TEAM_SIZE_NOT_ALLOWED");
  }
  return {
    event: {
      type: "TEAM_SIZE_CHANGED",
      teamSize: command.teamSize,
      newTeamIds: factory.ids,
    },
  };
}
