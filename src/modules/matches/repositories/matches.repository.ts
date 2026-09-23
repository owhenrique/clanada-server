import type { Event, MatchState, MatchStatus } from "../../../domain/match";

export type MatchTimer = {
  startedAt: Date | null;
  elapsedMs: number;
};

export type StoredMatch = {
  id: string;
  code: string;
  status: MatchStatus;
  version: number;
  snapshot: MatchState;
  timer: MatchTimer;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredEvent = {
  seq: number;
  event: Event;
  createdAt: Date;
};

export type CreateMatchInput = {
  code: string;
  event: Event;
  snapshot: MatchState;
};

export type AppendInput = {
  matchId: string;
  expectedVersion: number;
  events: readonly Event[];
  snapshot: MatchState;
  timer?: MatchTimer;
};

export type RevokeLastInput = {
  matchId: string;
  expectedVersion: number;
  snapshot: MatchState;
};

export type UpdateTimerInput = {
  matchId: string;
  expectedVersion: number;
  timer: MatchTimer;
};

export class MatchCodeCollisionError extends Error {
  constructor(code: string) {
    super(`invariant: match code "${code}" is already in use`);
    this.name = "MatchCodeCollisionError";
  }
}

export abstract class MatchesRepository {
  abstract create(input: CreateMatchInput): Promise<StoredMatch>;
  abstract findByCode(code: string): Promise<StoredMatch | null>;
  abstract listActiveEvents(matchId: string): Promise<StoredEvent[]>;
  abstract append(input: AppendInput): Promise<StoredMatch>;
  abstract revokeLast(input: RevokeLastInput): Promise<StoredMatch>;
  abstract updateTimer(input: UpdateTimerInput): Promise<StoredMatch>;
}
