import { DomainError } from "../../shared/errors/domain-error";
import { at, shuffle, requireState, recordingIdFactory } from "./support";
import { normalizeName, hasUnresolvedDuplicates } from "./players";
import {
  resolveRuleToggles,
  type RuleToggles,
  type Player,
  type Team,
  type MatchState,
  type MatchConfig,
  type TeamIdFactory,
  type Command,
  type CommandContext,
  type DecideResult,
} from "./model";

export function fullTeamCount(playerCount: number, teamSize: number): number {
  return Math.floor(playerCount / teamSize);
}

export function formInitialState(
  players: Player[],
  config: MatchConfig,
  teamId: TeamIdFactory,
): MatchState {
  const fullTeams = fullTeamCount(players.length, config.teamSize);
  const teams: Team[] = [];
  for (let index = 0; index < fullTeams; index++) {
    const start = index * config.teamSize;
    teams.push({
      id: teamId(index),
      players: players.slice(start, start + config.teamSize),
      color: config.colors[index] ?? null,
      gameStreak: 0,
    });
  }
  const queue = players.slice(fullTeams * config.teamSize);
  return { status: "DRAFT", config, teams, queue };
}

export function compactQueue(
  teams: Team[],
  queue: Player[],
  teamSize: number,
  createTeamId: () => string,
): { teams: Team[]; queue: Player[] } {
  const result = [...teams];
  let remaining = queue;
  while (remaining.length >= teamSize) {
    result.push({
      id: createTeamId(),
      players: remaining.slice(0, teamSize),
      color: null,
      gameStreak: 0,
    });
    remaining = remaining.slice(teamSize);
  }
  return { teams: result, queue: remaining };
}

export function usedColors(teams: Team[]): Set<string> {
  return new Set(
    teams
      .map((team) => team.color)
      .filter((color): color is string => color !== null),
  );
}

export function assignBibs(
  teams: Team[],
  colors: string[],
  previouslyHeldColors: ReadonlySet<string>,
): Team[] {
  const bibCount = colors.length;
  const result = teams.map((team, index) => ({
    ...team,
    color: index < bibCount ? team.color : null,
  }));
  const held = new Set(
    result
      .slice(0, bibCount)
      .map((team) => team.color)
      .filter((color): color is string => color !== null),
  );
  const neverUsed = colors.filter(
    (color) => !held.has(color) && !previouslyHeldColors.has(color),
  );
  const recentlyFreed = colors.filter(
    (color) => !held.has(color) && previouslyHeldColors.has(color),
  );
  const freeColors = [...neverUsed, ...recentlyFreed];
  let freeIndex = 0;
  for (let i = 0; i < result.length && i < bibCount; i++) {
    if (at(result, i).color === null) {
      result[i] = { ...at(result, i), color: at(freeColors, freeIndex) };
      freeIndex++;
    }
  }
  return result;
}

export function flattenPlayers(state: MatchState): Player[] {
  return [...state.teams.flatMap((team) => team.players), ...state.queue];
}

export function orderPlayers(
  players: Player[],
  seatedCount: number,
  teamSize: number,
  toggles: RuleToggles,
  rng: () => number,
): Player[] {
  if (!toggles.arrivalPriority) {
    return shuffle(players, rng);
  }
  const fieldCount = Math.min(seatedCount, 2 * teamSize);
  return [...shuffle(players.slice(0, fieldCount), rng), ...players.slice(fieldCount)];
}

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

export function decideSetup(
  state: MatchState | null,
  command: Extract<Command, { type: "setup" }>,
  ctx: CommandContext,
): DecideResult {
  requireState(state);
  const created = decideCreate(null, { ...command, type: "create" }, ctx);
  if (!("event" in created) || created.event.type !== "MATCH_CREATED") {
    throw new Error("invariant: create always returns MATCH_CREATED");
  }
  return { event: { ...created.event, type: "MATCH_SET_UP" } };
}

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
