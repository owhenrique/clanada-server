import { onFieldTeams, applyGameResult } from "../rules/game-result";
import { recordingIdFactory } from "../id-factory";
import { DomainError } from "../../../shared/errors/domain-error";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideGameWon(
  state: MatchState | null,
  loserTeamId: string,
  decidedBy: "match" | "penalties",
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const [first, second] = onFieldTeams(current);
  if (loserTeamId !== first.id && loserTeamId !== second.id) {
    throw new DomainError("TEAM_NOT_ON_FIELD");
  }
  const factory = recordingIdFactory(ctx.nextId);
  applyGameResult(current, loserTeamId, factory.createId);
  return {
    event: {
      type: "GAME_WON",
      loserTeamId,
      decidedBy,
      newTeamIds: factory.ids,
    },
  };
}

export function decideWin(
  state: MatchState | null,
  command: Extract<Command, { type: "win" }>,
  ctx: CommandContext,
): DecideResult {
  return decideGameWon(state, command.loserTeamId, "match", ctx);
}
