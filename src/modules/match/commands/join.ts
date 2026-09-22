import { normalizeName } from "../players";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideJoin(
  state: MatchState | null,
  command: Extract<Command, { type: "join" }>,
  ctx: CommandContext,
): DecideResult {
  requireState(state);
  return {
    event: {
      type: "PLAYER_JOINED",
      player: { id: ctx.nextId(), name: normalizeName(command.name) },
      newTeamIds: [],
    },
  };
}
