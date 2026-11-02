import { DomainError } from "../../shared/errors/domain-error";
import { assignBibs, usedColors } from "./lineup";
import type { Command, CommandContext, DecideResult, Event, MatchState } from "./model";
import { requireState } from "./support";

export function decideAddColors(
  state: MatchState | null,
  command: Extract<Command, { type: "addColors" }>,
  _ctx: CommandContext,
): DecideResult {
  const current = requireState(state);
  const unique = new Set(command.colors);
  const repeated = command.colors.some((color) => current.config.colors.includes(color));
  if (command.colors.length === 0 || unique.size !== command.colors.length || repeated) {
    throw new DomainError("COLORS_INVALID");
  }
  return { event: { type: "COLORS_ADDED", colors: command.colors } };
}

export function addColors(
  state: MatchState,
  event: Extract<Event, { type: "COLORS_ADDED" }>,
): MatchState {
  const colors = [...state.config.colors, ...event.colors];
  return {
    ...state,
    config: { ...state.config, colors },
    teams: assignBibs(state.teams, colors, usedColors(state.teams)),
  };
}
