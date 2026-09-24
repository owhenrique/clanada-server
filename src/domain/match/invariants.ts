import type { MatchState, Team } from "./model";

export type InvariantRule =
  | "DUPLICATE_PLAYER"
  | "TEAM_SIZE_MISMATCH"
  | "QUEUE_TOO_LONG"
  | "COLOR_REUSED"
  | "COLOR_COUNT_EXCEEDS_LIMIT"
  | "ON_FIELD_COLOR_CLASH";

export class InvariantViolation extends Error {
  readonly rule: InvariantRule;

  constructor(rule: InvariantRule) {
    super(rule);
    this.name = "InvariantViolation";
    this.rule = rule;
  }
}

function allPlayerIds(state: MatchState): string[] {
  return [
    ...state.teams.flatMap((team) => team.players.map((player) => player.id)),
    ...state.queue.map((player) => player.id),
  ];
}

function assertNoDuplicatePlayers(state: MatchState): void {
  const ids = allPlayerIds(state);
  if (new Set(ids).size !== ids.length) {
    throw new InvariantViolation("DUPLICATE_PLAYER");
  }
}

function assertTeamSizes(state: MatchState): void {
  const mismatched = state.teams.some(
    (team) => team.players.length !== state.config.teamSize,
  );
  if (mismatched) {
    throw new InvariantViolation("TEAM_SIZE_MISMATCH");
  }
}

function assertQueueBelowTeamSize(state: MatchState): void {
  if (state.queue.length >= state.config.teamSize) {
    throw new InvariantViolation("QUEUE_TOO_LONG");
  }
}

function coloredTeams(state: MatchState): Team[] {
  return state.teams.filter((team) => team.color !== null);
}

function assertColors(state: MatchState): void {
  const colored = coloredTeams(state);
  const colors = colored.map((team) => team.color);
  if (new Set(colors).size !== colors.length) {
    throw new InvariantViolation("COLOR_REUSED");
  }
  if (colored.length > state.config.colors.length) {
    throw new InvariantViolation("COLOR_COUNT_EXCEEDS_LIMIT");
  }
}

function assertOnFieldColorsDiffer(state: MatchState): void {
  const [first, second] = state.teams;
  if (
    first?.color !== null &&
    first?.color !== undefined &&
    second?.color !== null &&
    second?.color !== undefined &&
    first.color === second.color
  ) {
    throw new InvariantViolation("ON_FIELD_COLOR_CLASH");
  }
}

export function assertValidState(state: MatchState): void {
  assertNoDuplicatePlayers(state);
  assertTeamSizes(state);
  assertQueueBelowTeamSize(state);
  assertOnFieldColorsDiffer(state);
  assertColors(state);
}
