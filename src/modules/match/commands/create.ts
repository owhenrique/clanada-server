import { normalizeName, hasUnresolvedDuplicates } from "../players";
import { shuffle } from "../rules/shuffle";
import { recordingIdFactory } from "../id-factory";
import { DomainError } from "../../../shared/errors/domain-error";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideCreate(
  _state: MatchState | null,
  command: Extract<Command, { type: "create" }>,
  ctx: CommandContext,
): DecideResult {
  const players = command.playerNames.map((name) => ({
    id: ctx.nextId(),
    name: normalizeName(name),
  }));
  if (hasUnresolvedDuplicates(players)) {
    throw new DomainError("DUPLICATE_PLAYER_NAMES");
  }
  const order = shuffle(players, ctx.random);
  const fullTeams = Math.floor(order.length / command.config.teamSize);
  const factory = recordingIdFactory(ctx.nextId);
  for (let i = 0; i < fullTeams; i++) {
    factory.createId();
  }
  return {
    event: {
      type: "MATCH_CREATED",
      config: command.config,
      players: order,
      teamIds: factory.ids,
    },
  };
}
