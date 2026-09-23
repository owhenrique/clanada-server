import { Injectable } from "@nestjs/common";
import { DomainError } from "../../../shared/errors/domain-error";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { Prisma, type Match as MatchRow } from "../../../generated/prisma/client";
import { UNDOABLE_EVENTS, type Event, type MatchState } from "../../../domain/match";
import { decodeEvent, encodeEventPayload } from "./event-codec";
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

type MatchClient = PrismaService | Prisma.TransactionClient;

async function applyVersionGuardedUpdate(
  client: MatchClient,
  matchId: string,
  expectedVersion: number,
  data: Prisma.MatchUpdateManyMutationInput,
): Promise<void> {
  const guard = await client.match.updateMany({
    where: { id: matchId, version: expectedVersion },
    data: { version: { increment: 1 }, ...data },
  });
  if (guard.count === 0) {
    throw new DomainError("VERSION_CONFLICT");
  }
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
    try {
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
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new MatchCodeCollisionError(input.code);
      }
      throw error;
    }
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
      await applyVersionGuardedUpdate(tx, input.matchId, input.expectedVersion, {
        snapshot: toInputJson(input.snapshot),
        status: input.snapshot.status,
        ...(input.timer !== undefined
          ? { timerStartedAt: input.timer.startedAt, timerElapsedMs: input.timer.elapsedMs }
          : {}),
      });
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
      await applyVersionGuardedUpdate(tx, input.matchId, input.expectedVersion, {
        snapshot: toInputJson(input.snapshot),
        status: input.snapshot.status,
      });
      await tx.matchEvent.update({ where: { matchId_seq: { matchId: target.matchId, seq: target.seq } }, data: { revokedAt: new Date() } });
      const match = await tx.match.findUniqueOrThrow({ where: { id: input.matchId } });
      return toStoredMatch(match);
    });
  }

  async updateTimer(input: UpdateTimerInput): Promise<StoredMatch> {
    await applyVersionGuardedUpdate(this.prisma, input.matchId, input.expectedVersion, {
      timerStartedAt: input.timer.startedAt,
      timerElapsedMs: input.timer.elapsedMs,
    });
    const match = await this.prisma.match.findUniqueOrThrow({ where: { id: input.matchId } });
    return toStoredMatch(match);
  }
}
