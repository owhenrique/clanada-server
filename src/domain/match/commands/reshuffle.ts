import { flattenPlayers } from "../rules/flatten";
import { orderPlayers } from "../rules/arrival-order";
import { fullTeamCount } from "../rules/formation";
import { recordingIdFactory } from "../id-factory";
import { requireState } from "../require-state";
import type { MatchState } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";

export function decideReshuffle(
  state: MatchState | null,
  _command: Extract<Command, { type: "reshuffle" }>,
  ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const seatedCount = current.teams.reduce((count, team) => count + team.players.length, 0);
  const order = orderPlayers(
    flattenPlayers(current),
    seatedCount,
    current.config.teamSize,
    current.config.ruleToggles,
    ctx.random,
  );
  const fullTeams = fullTeamCount(order.length, current.config.teamSize);
  const factory = recordingIdFactory(ctx.nextId);
  for (let i = 0; i < fullTeams; i++) {
    factory.createId();
  }
  return {
    event: {
      type: "RESHUFFLED",
      order: order.map((player) => player.id),
      teamIds: factory.ids,
    },
  };
}
