export type DomainErrorCode =
  | "MATCH_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_STATUS"
  | "DUPLICATE_PLAYER_NAMES"
  | "NOT_ENOUGH_TEAMS"
  | "PLAYER_NOT_FOUND"
  | "TEAM_NOT_ON_FIELD"
  | "PLAYER_LOCKED"
  | "NO_DONOR_AVAILABLE"
  | "TIMER_RUNNING"
  | "TEAM_SIZE_NOT_ALLOWED"
  | "NOTHING_TO_UNDO";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(code);
    this.name = "DomainError";
    this.code = code;
  }
}

export class VersionConflictError<TView extends object = object> extends DomainError {
  constructor(readonly view: TView) {
    super("VERSION_CONFLICT");
    this.name = "VersionConflictError";
  }
}
