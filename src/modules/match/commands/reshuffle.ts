import { flattenPlayers } from "../rules/flatten";
import { shuffle } from "../rules/shuffle";
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
  const order = shuffle(flattenPlayers(current), ctx.random);
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
