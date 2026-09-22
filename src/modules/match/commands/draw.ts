import { resolveDraw } from "../rules/draw";
import { recordingIdFactory } from "../id-factory";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideDraw(
  state: MatchState | null,
  _command: Extract<Command, { type: "draw" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const factory = recordingIdFactory(ctx.nextId);
  const outcome = resolveDraw(current, ctx.random, factory.createId);
  if (outcome.type === "penalties") {
    return { penaltiesRequired: true };
  }
  return {
    event: {
      type: "GAME_DRAWN",
      firstLeaverTeamId: outcome.firstLeaverTeamId,
      newTeamIds: factory.ids,
    },
  };
}
