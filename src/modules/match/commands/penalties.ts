import { decideGameWon } from "./win";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decidePenalties(
  state: MatchState | null,
  command: Extract<Command, { type: "penalties" }>,
  ctx: CommandContext,
): DecideResult {
  return decideGameWon(state, command.loserTeamId, "penalties", ctx);
}
