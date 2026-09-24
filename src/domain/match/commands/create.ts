import { normalizeName, hasUnresolvedDuplicates } from "../players";
import { orderPlayers } from "../rules/arrival-order";
import { resolveRuleToggles } from "../rule-toggles";
import { fullTeamCount } from "../rules/formation";
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
  const config = { ...command.config, ruleToggles: resolveRuleToggles(command.config.ruleToggles) };
  const fullTeams = fullTeamCount(players.length, config.teamSize);
  const order = orderPlayers(players, fullTeams * config.teamSize, config.teamSize, config.ruleToggles, ctx.random);
  const factory = recordingIdFactory(ctx.nextId);
  for (let i = 0; i < fullTeams; i++) {
    factory.createId();
  }
  return {
    event: {
      type: "MATCH_CREATED",
      config,
      players: order,
      teamIds: factory.ids,
    },
  };
}
