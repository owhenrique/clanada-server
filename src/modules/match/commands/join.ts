import { normalizeName } from "../players";
import { requireState } from "../require-state";
import { playerJoins } from "../rules/join";
import { recordingIdFactory } from "../id-factory";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideJoin(
  state: MatchState | null,
  command: Extract<Command, { type: "join" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const player = { id: ctx.nextId(), name: normalizeName(command.name) };
  const factory = recordingIdFactory(ctx.nextId);
  playerJoins(current, player, factory.createId);
  return {
    event: {
      type: "PLAYER_JOINED",
      player,
      newTeamIds: factory.ids,
    },
  };
}
