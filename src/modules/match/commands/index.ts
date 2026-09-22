import { DomainError } from "../../../shared/errors/domain-error";
import type { MatchState, MatchStatus } from "../types";
import type { Command, CommandContext, DecideResult } from "./types";
import { decideCreate } from "./create";
import { decideReshuffle } from "./reshuffle";
import { decideSwap } from "./swap";
import { decideStart } from "./start";
import { decideWin } from "./win";
import { decideDraw } from "./draw";
import { decidePenalties } from "./penalties";
import { decideJoin } from "./join";
import { decideLeave } from "./leave";
import { decideEnd } from "./end";

type Handler = (
  state: MatchState | null,
  command: Command,
  ctx: CommandContext,
) => DecideResult;

const handlers: Record<Command["type"], Handler> = {
  create: decideCreate as Handler,
  reshuffle: decideReshuffle as Handler,
  swap: decideSwap as Handler,
  start: decideStart as Handler,
  win: decideWin as Handler,
  draw: decideDraw as Handler,
  penalties: decidePenalties as Handler,
  join: decideJoin as Handler,
  leave: decideLeave as Handler,
  end: decideEnd as Handler,
};

const allowedStatus: Record<Command["type"], MatchStatus[] | null> = {
  create: null,
  reshuffle: ["DRAFT"],
  swap: ["DRAFT", "ACTIVE"],
  start: ["DRAFT"],
  win: ["ACTIVE"],
  draw: ["ACTIVE"],
  penalties: ["ACTIVE"],
  join: ["ACTIVE"],
  leave: ["ACTIVE"],
  end: ["ACTIVE"],
};

export function decide(
  state: MatchState | null,
  command: Command,
  ctx: CommandContext,
): DecideResult {
  const allowed = allowedStatus[command.type];
  if (allowed !== null && (state === null || !allowed.includes(state.status))) {
    throw new DomainError("INVALID_STATUS");
  }
  return handlers[command.type](state, command, ctx);
}
