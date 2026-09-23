import { describe, expect, it, vi } from "vitest";
import type { PinoLogger } from "nestjs-pino";
import { DomainError, VersionConflictError } from "../../../shared/errors/domain-error";
import type { Clock } from "../../../shared/ports/clock";
import type { IdGenerator } from "../../../shared/ports/id-generator";
import type { RandomSource } from "../../../shared/ports/random-source";
import type { MatchConfig } from "../../../domain/match";
import { InMemoryMatchesRepository } from "../repositories/in-memory-matches.repository";
import {
  MatchCodeCollisionError,
  MatchesRepository,
  type AppendInput,
  type CreateMatchInput,
  type RevokeLastInput,
  type StoredEvent,
  type StoredMatch,
  type UpdateTimerInput,
} from "../repositories/matches.repository";
import { MatchesService } from "./matches.service";
import type { MatchView } from "./match-view";

const config: MatchConfig = { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 };
const playerNames = ["Ana", "Beto", "Caio", "Duda"];

function sequentialIds(prefix: string): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}${n++}` };
}

function incrementingRandom(step = 0.031): RandomSource {
  let value = 0;
  return {
    next: () => {
      value = (value + step) % 1;
      return value;
    },
  };
}

function fixedClock(iso: string): Clock {
  const now = new Date(iso);
  return { now: () => now };
}

type FakeLogger = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

function fakeLogger(): FakeLogger {
  return { info: vi.fn(), warn: vi.fn() };
}

function makeService(overrides?: {
  repository?: MatchesRepository;
  clock?: Clock;
  idGenerator?: IdGenerator;
  random?: RandomSource;
  logger?: FakeLogger;
}): {
  service: MatchesService;
  repository: MatchesRepository;
  logger: FakeLogger;
} {
  const repository = overrides?.repository ?? new InMemoryMatchesRepository();
  const clock = overrides?.clock ?? fixedClock("2026-09-22T12:00:00.000Z");
  const idGenerator = overrides?.idGenerator ?? sequentialIds("id");
  const random = overrides?.random ?? incrementingRandom();
  const logger = overrides?.logger ?? fakeLogger();
  const service = new MatchesService(repository, clock, idGenerator, random, logger as unknown as PinoLogger);
  return { service, repository, logger };
}

function asView(result: MatchView | { penaltiesRequired: true }): MatchView {
  if ("penaltiesRequired" in result) {
    throw new Error("expected a MatchView, got penaltiesRequired");
  }
  return result;
}

class AlwaysCollidingRepository extends MatchesRepository {
  attempts = 0;

  create(input: CreateMatchInput): Promise<StoredMatch> {
    this.attempts++;
    return Promise.reject(new MatchCodeCollisionError(input.code));
  }

  findByCode(): Promise<StoredMatch | null> {
    return Promise.resolve(null);
  }

  listActiveEvents(): Promise<StoredEvent[]> {
    return Promise.resolve([]);
  }

  append(): Promise<StoredMatch> {
    throw new Error("not used in this fake");
  }

  revokeLast(): Promise<StoredMatch> {
    throw new Error("not used in this fake");
  }

  updateTimer(): Promise<StoredMatch> {
    throw new Error("not used in this fake");
  }
}

class CollidingOnceRepository extends MatchesRepository {
  codes: string[] = [];
  private attempts = 0;

  constructor(private readonly inner: MatchesRepository) {
    super();
  }

  create(input: CreateMatchInput): Promise<StoredMatch> {
    this.codes.push(input.code);
    this.attempts++;
    if (this.attempts === 1) {
      return Promise.reject(new MatchCodeCollisionError(input.code));
    }
    return this.inner.create(input);
  }

  findByCode(code: string): Promise<StoredMatch | null> {
    return this.inner.findByCode(code);
  }

  listActiveEvents(matchId: string): Promise<StoredEvent[]> {
    return this.inner.listActiveEvents(matchId);
  }

  append(input: AppendInput): Promise<StoredMatch> {
    return this.inner.append(input);
  }

  revokeLast(input: RevokeLastInput): Promise<StoredMatch> {
    return this.inner.revokeLast(input);
  }

  updateTimer(input: UpdateTimerInput): Promise<StoredMatch> {
    return this.inner.updateTimer(input);
  }
}

class RaceOnFirstAppendRepository extends MatchesRepository {
  private appendCalls = 0;

  constructor(private readonly inner: MatchesRepository) {
    super();
  }

  create(input: CreateMatchInput): Promise<StoredMatch> {
    return this.inner.create(input);
  }

  findByCode(code: string): Promise<StoredMatch | null> {
    return this.inner.findByCode(code);
  }

  listActiveEvents(matchId: string): Promise<StoredEvent[]> {
    return this.inner.listActiveEvents(matchId);
  }

  async append(input: AppendInput): Promise<StoredMatch> {
    this.appendCalls++;
    if (this.appendCalls === 1) {
      await this.inner.append(input);
      throw new DomainError("VERSION_CONFLICT");
    }
    return this.inner.append(input);
  }

  revokeLast(input: RevokeLastInput): Promise<StoredMatch> {
    return this.inner.revokeLast(input);
  }

  updateTimer(input: UpdateTimerInput): Promise<StoredMatch> {
    return this.inner.updateTimer(input);
  }
}

describe("MatchesService", () => {
  it("CEN-1: create returns a DRAFT MatchView with the sorted teams", async () => {
    const { service } = makeService();

    const view = await service.create({ config, playerNames });

    expect(view.status).toBe("DRAFT");
    expect(view.version).toBe(1);
    expect(view.code).toHaveLength(8);
    expect(view.teams).toHaveLength(2);
    expect(view.teams[0]?.players).toHaveLength(2);
    expect(view.teams[1]?.players).toHaveLength(2);
    expect(view.queue).toEqual([]);
    expect(view.canUndo).toBe(false);
    expect(view.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    expect(view.serverNow).toBe("2026-09-22T12:00:00.000Z");
  });

  it("CEN-2: create rejects duplicate names without persisting anything", async () => {
    const repository = new InMemoryMatchesRepository();
    const createSpy = vi.spyOn(repository, "create");
    const { service } = makeService({ repository });

    await expect(service.create({ config, playerNames: ["Ana", "ana"] })).rejects.toMatchObject({
      code: "DUPLICATE_PLAYER_NAMES",
    });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("CEN-4: create retries with a new code when the first one collides", async () => {
    const repository = new CollidingOnceRepository(new InMemoryMatchesRepository());
    const { service } = makeService({ repository });

    const view = await service.create({ config, playerNames });

    expect(repository.codes).toHaveLength(2);
    expect(repository.codes[0]).not.toBe(repository.codes[1]);
    expect(view.code).toBe(repository.codes[1]);
  });

  it("CEN-5: create gives up after 5 attempts", async () => {
    const repository = new AlwaysCollidingRepository();
    const { service } = makeService({ repository });

    await expect(service.create({ config, playerNames })).rejects.toBeInstanceOf(MatchCodeCollisionError);
    expect(repository.attempts).toBe(5);
  });

  it("CEN-6 (unit): get returns the current MatchView", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });

    const view = await service.get(created.code);

    expect(view).toEqual(created);
  });

  it("CEN-7 (unit): get throws MATCH_NOT_FOUND for an unknown code", async () => {
    const { service } = makeService();

    await expect(service.get("ZZZZZZZZ")).rejects.toMatchObject({ code: "MATCH_NOT_FOUND" });
  });

  it("CEN-8: reshuffle produces a new order and logs the completed action", async () => {
    const { service, logger } = makeService();
    const created = await service.create({ config, playerNames });

    const view = asView(await service.execute(created.code, created.version, { type: "reshuffle" }));

    expect(view.version).toBe(2);
    expect(logger.info).toHaveBeenCalledWith({
      action: "reshuffle",
      matchCode: created.code,
      eventType: "RESHUFFLED",
      version: 2,
    });
  });

  it("CEN-9: reshuffle outside DRAFT is rejected and logs a warning", async () => {
    const { service, logger, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    await expect(service.execute(started.code, started.version, { type: "reshuffle" })).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
    expect(logger.warn).toHaveBeenCalledWith({
      action: "reshuffle",
      matchCode: started.code,
      code: "INVALID_STATUS",
    });
    const stored = await repository.findByCode(started.code);
    expect(stored?.version).toBe(started.version);
  });

  it("CEN-10: swap exchanges two players between teams", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const playerA = created.teams[0]?.players[0];
    const playerB = created.teams[1]?.players[0];
    if (playerA === undefined || playerB === undefined) {
      throw new Error("fixture is missing players");
    }

    const view = asView(
      await service.execute(created.code, created.version, {
        type: "swap",
        playerAId: playerA.id,
        playerBId: playerB.id,
      }),
    );

    expect(view.version).toBe(2);
    expect(view.teams[0]?.players.some((player) => player.id === playerB.id)).toBe(true);
    expect(view.teams[1]?.players.some((player) => player.id === playerA.id)).toBe(true);
  });

  it("CEN-11: swap with an unknown player is rejected", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const playerB = created.teams[1]?.players[0];
    if (playerB === undefined) {
      throw new Error("fixture is missing players");
    }

    await expect(
      service.execute(created.code, created.version, {
        type: "swap",
        playerAId: "does-not-exist",
        playerBId: playerB.id,
      }),
    ).rejects.toMatchObject({ code: "PLAYER_NOT_FOUND" });
  });

  it("CEN-12: swap locks a player from an on-field team while the timer is running", async () => {
    const sixPlayers = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: sixPlayers });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const withTimerRunning = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 0 },
    });
    const onFieldPlayer = started.teams[0]?.players[0];
    const offFieldPlayer = started.teams[2]?.players[0];
    if (onFieldPlayer === undefined || offFieldPlayer === undefined) {
      throw new Error("fixture is missing players");
    }

    await expect(
      service.execute(started.code, withTimerRunning.version, {
        type: "swap",
        playerAId: onFieldPlayer.id,
        playerBId: offFieldPlayer.id,
      }),
    ).rejects.toMatchObject({ code: "PLAYER_LOCKED" });
  });

  it("CEN-13: start moves DRAFT to ACTIVE with at least 2 teams", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });

    const view = asView(await service.execute(created.code, created.version, { type: "start" }));

    expect(view.status).toBe("ACTIVE");
    expect(view.version).toBe(2);
  });

  it("CEN-14: start is rejected with fewer than 2 teams", async () => {
    const bigConfig: MatchConfig = { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 };
    const sixNames = ["A", "B", "C", "D", "E", "F"];
    const { service } = makeService();
    const created = await service.create({ config: bigConfig, playerNames: sixNames });

    await expect(service.execute(created.code, created.version, { type: "start" })).rejects.toMatchObject({
      code: "NOT_ENOUGH_TEAMS",
    });
  });

  it("CEN-16: a stale If-Match returns VersionConflictError with the current MatchView, without applying the command", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });

    const error: unknown = await service
      .execute(created.code, 99, { type: "reshuffle" })
      .catch((caught: unknown) => caught);

    if (!(error instanceof VersionConflictError)) {
      throw new Error("expected a VersionConflictError");
    }
    expect(error.view).toMatchObject({ code: created.code, version: 1, status: "DRAFT" });

    const stored = await repository.findByCode(created.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(stored.version).toBe(1);
    expect(await repository.listActiveEvents(stored.id)).toHaveLength(1);
  });

  it("CEN-17: a real race at append() is retried into a VersionConflictError built from a fresh read", async () => {
    const repository = new RaceOnFirstAppendRepository(new InMemoryMatchesRepository());
    const { service } = makeService({ repository });
    const created = await service.create({ config, playerNames });

    const error: unknown = await service
      .execute(created.code, created.version, { type: "reshuffle" })
      .catch((caught: unknown) => caught);

    if (!(error instanceof VersionConflictError)) {
      throw new Error("expected a VersionConflictError");
    }
    expect(error.view).toMatchObject({ code: created.code, version: 2 });
  });

  it("CEN-18: logs never include a player's name", async () => {
    const { service, logger } = makeService();
    const created = await service.create({ config, playerNames });
    await service.execute(created.code, created.version, { type: "reshuffle" });
    const started = asView(await service.execute(created.code, 2, { type: "start" }));
    await service.execute(started.code, started.version, { type: "reshuffle" }).catch(() => undefined);

    const serialized = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    for (const name of playerNames) {
      expect(serialized).not.toContain(name);
    }
  });
});
