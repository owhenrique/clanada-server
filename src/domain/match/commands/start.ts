import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideStart(
  state: MatchState | null,
  _command: Extract<Command, { type: "start" }>,
  _ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  if (current.teams.length < 2) {
    throw new DomainError("NOT_ENOUGH_TEAMS");
  }
  return { event: { type: "MATCH_STARTED" } };
}
