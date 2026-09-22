import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideEnd(
  state: MatchState | null,
  _command: Extract<Command, { type: "end" }>,
  _ctx: CommandContext,
): DecideResult {
  requireState(state);
  return { event: { type: "MATCH_ENDED" } };
}
