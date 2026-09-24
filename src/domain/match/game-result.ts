import { DomainError } from "../../shared/errors/domain-error";
import { requireState, recordingIdFactory } from "./support";
import { compactQueue, assignBibs, usedColors } from "./lineup";
import type {
  Team,
  Player,
  MatchState,
  DrawOutcome,
  Command,
  CommandContext,
  DecideResult,
} from "./model";

export function onFieldTeams(state: MatchState): [Team, Team] {
  const [first, second] = state.teams;
  if (first === undefined || second === undefined) {
    throw new Error("invariant: onFieldTeams requires at least two teams");
  }
  return [first, second];
}

export function applyGameResult(
  state: MatchState,
  loserId: string,
  createTeamId: () => string,
): MatchState {
  const [first, second] = onFieldTeams(state);
  const loser = first.id === loserId ? first : second;
  const winner = first.id === loserId ? second : first;
  const winnerAfter: Team = { ...winner, gameStreak: winner.gameStreak + 1 };
  const waiting = state.teams.slice(2);

  let teams: Team[];
  let queue: Player[];

  if (state.queue.length === 0) {
    const loserAfter: Team = { ...loser, gameStreak: 0 };
    teams =
      waiting.length > 0
        ? [winnerAfter, ...waiting, loserAfter]
        : [winnerAfter, loserAfter];
    queue = [];
  } else {
    teams = [winnerAfter, ...waiting];
    queue = [...state.queue, ...loser.players];
  }

  const compacted = compactQueue(teams, queue, state.config.teamSize, createTeamId);
  return {
    ...state,
    teams: assignBibs(compacted.teams, state.config.colors, usedColors(state.teams)),
    queue: compacted.queue,
  };
}

function orderedLeavers(state: MatchState, firstLeaverTeamId: string): [Team, Team] {
  const [first, second] = onFieldTeams(state);
  return first.id === firstLeaverTeamId ? [first, second] : [second, first];
}

export function applyDraw(
  state: MatchState,
  firstLeaverTeamId: string,
  createTeamId: () => string,
): MatchState {
  const waiting = state.teams.slice(2);
  const complete = waiting.filter(
    (team) => team.players.length === state.config.teamSize,
  );
  const entering = complete.slice(0, 2);
  const enteringIds = new Set(entering.map((team) => team.id));
  const remaining = waiting.filter((team) => !enteringIds.has(team.id));
  const leavers = orderedLeavers(state, firstLeaverTeamId);
  const queue = [...state.queue, ...leavers[0].players, ...leavers[1].players];
  const compacted = compactQueue(
    [...entering, ...remaining],
    queue,
    state.config.teamSize,
    createTeamId,
  );
  const teams = assignBibs(
    compacted.teams,
    state.config.colors,
    usedColors(state.teams),
  );
  return { ...state, teams, queue: compacted.queue };
}

export function resolveDraw(
  state: MatchState,
  rng: () => number,
  createTeamId: () => string,
): DrawOutcome {
  const waiting = state.teams.slice(2);
  const complete = waiting.filter(
    (team) => team.players.length === state.config.teamSize,
  );
  if (complete.length < 2) {
    return { type: "penalties" };
  }
  const [first, second] = onFieldTeams(state);
  const firstLeaverTeamId = rng() < 0.5 ? first.id : second.id;
  return {
    type: "swap",
    state: applyDraw(state, firstLeaverTeamId, createTeamId),
    firstLeaverTeamId,
  };
}

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

export function decidePenalties(
  state: MatchState | null,
  command: Extract<Command, { type: "penalties" }>,
  ctx: CommandContext,
): DecideResult {
  return decideGameWon(state, command.loserTeamId, "penalties", ctx);
}
