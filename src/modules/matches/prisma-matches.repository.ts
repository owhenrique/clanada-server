import { Injectable } from "@nestjs/common";
import { DomainError } from "../../shared/errors/domain-error";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { Match as MatchRow, Prisma } from "../../generated/prisma/client";
import { UNDOABLE_EVENTS, type Event, type MatchState } from "../match";
import { decodeEvent, encodeEventPayload } from "./event-codec";
import {
  MatchesRepository,
  type AppendInput,
  type CreateMatchInput,
  type RevokeLastInput,
  type StoredEvent,
  type StoredMatch,
  type UpdateTimerInput,
} from "./matches.repository";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toStoredMatch(row: MatchRow): StoredMatch {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    version: row.version,
    snapshot: row.snapshot as unknown as MatchState,
    timer: { startedAt: row.timerStartedAt, elapsedMs: row.timerElapsedMs },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaMatchesRepository extends MatchesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateMatchInput): Promise<StoredMatch> {
    const row = await this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          code: input.code,
          status: input.snapshot.status,
          version: 1,
          snapshot: toInputJson(input.snapshot),
          timerStartedAt: null,
          timerElapsedMs: 0,
        },
      });
      await tx.matchEvent.create({
        data: {
          matchId: match.id,
          seq: 1,
          type: input.event.type,
          payload: toInputJson(encodeEventPayload(input.event)),
        },
      });
      return match;
    });
    return toStoredMatch(row);
  }

  async findByCode(code: string): Promise<StoredMatch | null> {
    const row = await this.prisma.match.findUnique({ where: { code } });
    return row === null ? null : toStoredMatch(row);
  }

  async listActiveEvents(matchId: string): Promise<StoredEvent[]> {
    const rows = await this.prisma.matchEvent.findMany({
      where: { matchId, revokedAt: null },
      orderBy: { seq: "asc" },
    });
    return rows.map(
      (row): StoredEvent => ({
        seq: row.seq,
        event: decodeEvent(row.type, row.payload),
        createdAt: row.createdAt,
      }),
    );
  }

  async append(input: AppendInput): Promise<StoredMatch> {
    return this.prisma.$transaction(async (tx) => {
      const guard = await tx.match.updateMany({
        where: { id: input.matchId, version: input.expectedVersion },
        data: {
          version: { increment: 1 },
          snapshot: toInputJson(input.snapshot),
          status: input.snapshot.status,
          ...(input.timer !== undefined
            ? { timerStartedAt: input.timer.startedAt, timerElapsedMs: input.timer.elapsedMs }
            : {}),
        },
      });
      if (guard.count === 0) {
        throw new DomainError("VERSION_CONFLICT");
      }
      const last = await tx.matchEvent.findFirst({
        where: { matchId: input.matchId },
        orderBy: { seq: "desc" },
      });
      let nextSeq = last?.seq ?? 0;
      for (const event of input.events) {
        nextSeq += 1;
        await tx.matchEvent.create({
          data: {
            matchId: input.matchId,
            seq: nextSeq,
            type: event.type,
            payload: toInputJson(encodeEventPayload(event)),
          },
        });
      }
      const match = await tx.match.findUniqueOrThrow({ where: { id: input.matchId } });
      return toStoredMatch(match);
    });
  }

  async revokeLast(input: RevokeLastInput): Promise<StoredMatch> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.match.findUnique({ where: { id: input.matchId } });
      if (current === null || current.version !== input.expectedVersion) {
        throw new DomainError("VERSION_CONFLICT");
      }
      const activeEvents = await tx.matchEvent.findMany({
        where: { matchId: input.matchId, revokedAt: null },
        orderBy: { seq: "desc" },
      });
      const target = activeEvents.find((event) => UNDOABLE_EVENTS.has(event.type as Event["type"]));
      if (target === undefined) {
        throw new DomainError("NOTHING_TO_UNDO");
      }
      const guard = await tx.match.updateMany({
        where: { id: input.matchId, version: input.expectedVersion },
        data: {
          version: { increment: 1 },
          snapshot: toInputJson(input.snapshot),
          status: input.snapshot.status,
        },
      });
      if (guard.count === 0) {
        throw new DomainError("VERSION_CONFLICT");
      }
      await tx.matchEvent.update({ where: { id: target.id }, data: { revokedAt: new Date() } });
      const match = await tx.match.findUniqueOrThrow({ where: { id: input.matchId } });
      return toStoredMatch(match);
    });
  }

  async updateTimer(input: UpdateTimerInput): Promise<StoredMatch> {
    const guard = await this.prisma.match.updateMany({
      where: { id: input.matchId, version: input.expectedVersion },
      data: {
        version: { increment: 1 },
        timerStartedAt: input.timer.startedAt,
        timerElapsedMs: input.timer.elapsedMs,
      },
    });
    if (guard.count === 0) {
      throw new DomainError("VERSION_CONFLICT");
    }
    const match = await this.prisma.match.findUniqueOrThrow({ where: { id: input.matchId } });
    return toStoredMatch(match);
  }
}
