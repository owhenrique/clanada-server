import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { UNDOABLE_EVENTS, type Event } from "../../../domain/match";
import {
  MatchCodeCollisionError,
  MatchesRepository,
  type AppendInput,
  type CreateMatchInput,
  type RevokeLastInput,
  type StoredEvent,
  type StoredMatch,
  type UpdateTimerInput,
} from "./matches.repository";

type InternalEvent = {
  seq: number;
  event: Event;
  revokedAt: Date | null;
  createdAt: Date;
};

function cloneMatch(match: StoredMatch): StoredMatch {
  return structuredClone(match);
}

function cloneEvent(event: StoredEvent): StoredEvent {
  return structuredClone(event);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

@Injectable()
export class InMemoryMatchesRepository extends MatchesRepository {
  private readonly matches = new Map<string, StoredMatch>();
  private readonly events = new Map<string, InternalEvent[]>();
  private readonly codeIndex = new Map<string, string>();

  create(input: CreateMatchInput): Promise<StoredMatch> {
    if (this.codeIndex.has(input.code)) {
      return Promise.reject(new MatchCodeCollisionError(input.code));
    }
    const id = randomUUID();
    const now = new Date();
    const match: StoredMatch = {
      id,
      code: input.code,
      status: input.snapshot.status,
      version: 1,
      snapshot: input.snapshot,
      timer: { startedAt: null, elapsedMs: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this.matches.set(id, cloneMatch(match));
    this.codeIndex.set(input.code, id);
    this.events.set(id, [{ seq: 1, event: input.event, revokedAt: null, createdAt: now }]);
    return Promise.resolve(cloneMatch(match));
  }

  findByCode(code: string): Promise<StoredMatch | null> {
    const id = this.codeIndex.get(code);
    if (id === undefined) {
      return Promise.resolve(null);
    }
    const match = this.matches.get(id);
    return Promise.resolve(match === undefined ? null : cloneMatch(match));
  }

  listActiveEvents(matchId: string): Promise<StoredEvent[]> {
    const events = this.events.get(matchId) ?? [];
    return Promise.resolve(
      events
        .filter((event) => event.revokedAt === null)
        .map((event) => cloneEvent({ seq: event.seq, event: event.event, createdAt: event.createdAt })),
    );
  }

  append(input: AppendInput): Promise<StoredMatch> {
    try {
      return Promise.resolve(this.appendSync(input));
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }

  revokeLast(input: RevokeLastInput): Promise<StoredMatch> {
    try {
      return Promise.resolve(this.revokeLastSync(input));
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }

  updateTimer(input: UpdateTimerInput): Promise<StoredMatch> {
    try {
      return Promise.resolve(this.updateTimerSync(input));
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }

  private appendSync(input: AppendInput): StoredMatch {
    const match = this.requireVersion(input.matchId, input.expectedVersion);
    const events = this.events.get(input.matchId) ?? [];
    let nextSeq = events.reduce((max, event) => Math.max(max, event.seq), 0);
    const now = new Date();
    for (const event of input.events) {
      nextSeq += 1;
      events.push({ seq: nextSeq, event, revokedAt: null, createdAt: now });
    }
    this.events.set(input.matchId, events);
    const updated: StoredMatch = {
      ...match,
      version: match.version + 1,
      snapshot: input.snapshot,
      status: input.snapshot.status,
      timer: input.timer ?? match.timer,
      updatedAt: now,
    };
    this.matches.set(input.matchId, cloneMatch(updated));
    return cloneMatch(updated);
  }

  private revokeLastSync(input: RevokeLastInput): StoredMatch {
    const match = this.requireVersion(input.matchId, input.expectedVersion);
    const events = this.events.get(input.matchId) ?? [];
    const target = [...events]
      .reverse()
      .find((event) => event.revokedAt === null && UNDOABLE_EVENTS.has(event.event.type));
    if (target === undefined) {
      throw new DomainError("NOTHING_TO_UNDO");
    }
    const now = new Date();
    target.revokedAt = now;
    const updated: StoredMatch = {
      ...match,
      version: match.version + 1,
      snapshot: input.snapshot,
      status: input.snapshot.status,
      updatedAt: now,
    };
    this.matches.set(input.matchId, cloneMatch(updated));
    return cloneMatch(updated);
  }

  private updateTimerSync(input: UpdateTimerInput): StoredMatch {
    const match = this.requireVersion(input.matchId, input.expectedVersion);
    const now = new Date();
    const updated: StoredMatch = {
      ...match,
      version: match.version + 1,
      timer: input.timer,
      updatedAt: now,
    };
    this.matches.set(input.matchId, cloneMatch(updated));
    return cloneMatch(updated);
  }

  private requireVersion(matchId: string, expectedVersion: number): StoredMatch {
    const match = this.matches.get(matchId);
    if (match === undefined || match.version !== expectedVersion) {
      throw new DomainError("VERSION_CONFLICT");
    }
    return match;
  }
}
