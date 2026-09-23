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

  it("S7 CEN-1: win swaps the losing team and zeroes the timer", async () => {
    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: sixNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const running = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 30000 },
    });
    const loserId = started.teams[1]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }

    const view = asView(
      await service.execute(started.code, running.version, { type: "win", loserTeamId: loserId }),
    );

    expect(view.version).toBe(running.version + 1);
    expect(view.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.at(-1)?.event).toMatchObject({
      type: "GAME_WON",
      loserTeamId: loserId,
      decidedBy: "match",
    });
  });

  it("S7 CEN-2: win rejects a team that is not on the field", async () => {
    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service } = makeService();
    const created = await service.create({ config, playerNames: sixNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const offFieldId = started.teams[2]?.id;
    if (offFieldId === undefined) {
      throw new Error("fixture is missing an off-field team");
    }

    await expect(
      service.execute(started.code, started.version, { type: "win", loserTeamId: offFieldId }),
    ).rejects.toMatchObject({ code: "TEAM_NOT_ON_FIELD" });
  });

  it("S7 CEN-3: penalties decide the winner and zero the timer", async () => {
    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: sixNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const running = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 30000 },
    });
    const loserId = started.teams[0]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }

    const view = asView(
      await service.execute(started.code, running.version, { type: "penalties", loserTeamId: loserId }),
    );

    expect(view.version).toBe(running.version + 1);
    expect(view.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.at(-1)?.event).toMatchObject({
      type: "GAME_WON",
      loserTeamId: loserId,
      decidedBy: "penalties",
    });
  });

  it("S7 CEN-4: draw with an available swap records GAME_DRAWN and zeroes the timer", async () => {
    const tenNames = Array.from({ length: 10 }, (_, index) => `Player${index}`);
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: tenNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    const view = asView(await service.execute(started.code, started.version, { type: "draw" }));

    expect(view.version).toBe(started.version + 1);
    expect(view.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.at(-1)?.event.type).toBe("GAME_DRAWN");
  });

  it("S7 CEN-5: draw without an available swap requires penalties without persisting", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    const result = await service.execute(started.code, started.version, { type: "draw" });

    expect(result).toEqual({ penaltiesRequired: true });
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(stored.version).toBe(started.version);
    expect(stored.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    expect(await repository.listActiveEvents(stored.id)).toHaveLength(2);
  });

  it("S7 CEN-6: join compacts the queue into a new team once it reaches teamSize", async () => {
    const bigConfig: MatchConfig = { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 };
    const fourteenNames = Array.from({ length: 14 }, (_, index) => `Player${index}`);
    const { service } = makeService();
    const created = await service.create({ config: bigConfig, playerNames: fourteenNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    expect(started.queue).toHaveLength(4);

    const view = asView(await service.execute(started.code, started.version, { type: "join", name: "Fabio" }));

    expect(view.version).toBe(started.version + 1);
    expect(view.queue).toEqual([]);
    expect(view.teams).toHaveLength(3);
  });

  it("S7 CEN-7: leave with a donor available fills the vacancy from the queue", async () => {
    const sevenNames = Array.from({ length: 7 }, (_, index) => `Player${index}`);
    const { service } = makeService();
    const created = await service.create({ config, playerNames: sevenNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    expect(started.queue).toHaveLength(1);
    const donorPlayer = started.queue[0];
    const leavingPlayer = started.teams[2]?.players[0];
    if (donorPlayer === undefined || leavingPlayer === undefined) {
      throw new Error("fixture is missing players");
    }

    const view = asView(
      await service.execute(started.code, started.version, { type: "leave", playerId: leavingPlayer.id }),
    );

    expect(view.version).toBe(started.version + 1);
    expect(view.queue).toEqual([]);
    expect(view.teams[2]?.players.some((player) => player.id === donorPlayer.id)).toBe(true);
  });

  it("S7 CEN-8: leave without a donor and no fallback is rejected", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const leavingPlayer = started.teams[0]?.players[0];
    if (leavingPlayer === undefined) {
      throw new Error("fixture is missing players");
    }

    await expect(
      service.execute(started.code, started.version, { type: "leave", playerId: leavingPlayer.id }),
    ).rejects.toMatchObject({ code: "NO_DONOR_AVAILABLE" });
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(stored.version).toBe(started.version);
  });

  it("S7 CEN-9: leave without a donor with the fallback reduces the team size", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const leavingPlayer = started.teams[0]?.players[0];
    if (leavingPlayer === undefined) {
      throw new Error("fixture is missing players");
    }

    const view = asView(
      await service.execute(started.code, started.version, {
        type: "leave",
        playerId: leavingPlayer.id,
        fallback: "reduce-team-size",
      }),
    );

    expect(view.version).toBe(started.version + 1);
    expect(view.config.teamSize).toBe(1);
  });

  it("S7 CEN-10: leave is rejected while an on-field player's timer is running", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const running = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 0 },
    });
    const leavingPlayer = started.teams[0]?.players[0];
    if (leavingPlayer === undefined) {
      throw new Error("fixture is missing players");
    }

    await expect(
      service.execute(started.code, running.version, { type: "leave", playerId: leavingPlayer.id }),
    ).rejects.toMatchObject({ code: "PLAYER_LOCKED" });
  });

  it("S7 CEN-11: change team size redistributes players and compacts the queue", async () => {
    const bigConfig: MatchConfig = { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 };
    const fourteenNames = Array.from({ length: 14 }, (_, index) => `Player${index}`);
    const { service } = makeService();
    const created = await service.create({ config: bigConfig, playerNames: fourteenNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    const view = asView(
      await service.execute(started.code, started.version, { type: "changeTeamSize", teamSize: 4 }),
    );

    expect(view.version).toBe(started.version + 1);
    expect(view.config.teamSize).toBe(4);
    expect(view.teams.every((team) => team.players.length === 4)).toBe(true);
  });

  it("S7 CEN-12: change team size is blocked while the timer is running", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const running = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 0 },
    });

    await expect(
      service.execute(started.code, running.version, { type: "changeTeamSize", teamSize: 1 }),
    ).rejects.toMatchObject({ code: "TIMER_RUNNING" });
  });

  it("S7 CEN-13: change team size rejects an equal value and a value leaving fewer than 2 teams", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    await expect(
      service.execute(started.code, started.version, { type: "changeTeamSize", teamSize: 2 }),
    ).rejects.toMatchObject({ code: "TEAM_SIZE_NOT_ALLOWED" });
    await expect(
      service.execute(started.code, started.version, { type: "changeTeamSize", teamSize: 3 }),
    ).rejects.toMatchObject({ code: "TEAM_SIZE_NOT_ALLOWED" });
  });

  it("S7 CEN-14: end moves ACTIVE to ENDED", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));

    const view = asView(await service.execute(started.code, started.version, { type: "end" }));

    expect(view.status).toBe("ENDED");
    expect(view.version).toBe(started.version + 1);
  });

  it("S7 CEN-15: mutation commands after end are rejected with INVALID_STATUS", async () => {
    const { service } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const ended = asView(await service.execute(started.code, started.version, { type: "end" }));
    const loserId = ended.teams[0]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }

    await expect(
      service.execute(ended.code, ended.version, { type: "win", loserTeamId: loserId }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(
      service.execute(ended.code, ended.version, { type: "join", name: "Zeca" }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(service.undo(ended.code, ended.version)).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("S7 CEN-16: undo reverts the most recent undoable event", async () => {
    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: sixNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const loserId = started.teams[1]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const won = asView(await service.execute(started.code, started.version, { type: "win", loserTeamId: loserId }));
    expect(won.version).toBe(3);

    const undone = await service.undo(won.code, won.version);

    expect(undone.version).toBe(4);
    const stored = await repository.findByCode(won.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.map((entry) => entry.event.type)).toEqual(["MATCH_CREATED", "MATCH_STARTED"]);
    expect(undone.teams).toEqual(started.teams);
    expect(undone.queue).toEqual(started.queue);
  });

  it("S7 CEN-17: three sequential undos return to the state right after start", async () => {
    const tenNames = Array.from({ length: 10 }, (_, index) => `Player${index}`);
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: tenNames });
    const reshuffled = asView(await service.execute(created.code, created.version, { type: "reshuffle" }));
    const started = asView(await service.execute(reshuffled.code, reshuffled.version, { type: "start" }));
    expect(started.version).toBe(3);
    const loserId = started.teams[1]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const won = asView(await service.execute(started.code, started.version, { type: "win", loserTeamId: loserId }));
    const joined = asView(await service.execute(won.code, won.version, { type: "join", name: "Extra" }));
    const drawn = asView(await service.execute(joined.code, joined.version, { type: "draw" }));
    expect(drawn.version).toBe(6);

    const afterFirstUndo = await service.undo(drawn.code, drawn.version);
    const afterSecondUndo = await service.undo(afterFirstUndo.code, afterFirstUndo.version);
    const afterThirdUndo = await service.undo(afterSecondUndo.code, afterSecondUndo.version);

    expect(afterThirdUndo.version).toBe(9);
    expect(afterThirdUndo.status).toBe("ACTIVE");
    const stored = await repository.findByCode(drawn.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.map((entry) => entry.event.type)).toEqual([
      "MATCH_CREATED",
      "RESHUFFLED",
      "MATCH_STARTED",
    ]);
    expect(afterThirdUndo.teams).toEqual(started.teams);
    expect(afterThirdUndo.queue).toEqual(started.queue);
  });

  it("S7 CEN-18: undo does not cross the MATCH_STARTED boundary", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const playerA = created.teams[0]?.players[0];
    const playerB = created.teams[1]?.players[0];
    if (playerA === undefined || playerB === undefined) {
      throw new Error("fixture is missing players");
    }
    const swapped = asView(
      await service.execute(created.code, created.version, {
        type: "swap",
        playerAId: playerA.id,
        playerBId: playerB.id,
      }),
    );
    const started = asView(await service.execute(swapped.code, swapped.version, { type: "start" }));
    expect(started.version).toBe(3);

    await expect(service.undo(started.code, started.version)).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(stored.version).toBe(3);
    const activeEvents = await repository.listActiveEvents(stored.id);
    expect(activeEvents.map((entry) => entry.event.type)).toEqual([
      "MATCH_CREATED",
      "PLAYERS_SWAPPED",
      "MATCH_STARTED",
    ]);
  });

  it("S7 CEN-19: undo right after start has nothing to undo", async () => {
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    expect(started.version).toBe(2);

    await expect(service.undo(started.code, started.version)).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });
    const stored = await repository.findByCode(started.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(stored.version).toBe(2);
  });

  it("S7 CEN-20: undo outside ACTIVE is rejected with INVALID_STATUS", async () => {
    const { service: draftService, repository: draftRepository } = makeService();
    const draftCreated = await draftService.create({ config, playerNames });
    const draftPlayerA = draftCreated.teams[0]?.players[0];
    const draftPlayerB = draftCreated.teams[1]?.players[0];
    if (draftPlayerA === undefined || draftPlayerB === undefined) {
      throw new Error("fixture is missing players");
    }
    const draftSwapped = asView(
      await draftService.execute(draftCreated.code, draftCreated.version, {
        type: "swap",
        playerAId: draftPlayerA.id,
        playerBId: draftPlayerB.id,
      }),
    );

    await expect(draftService.undo(draftSwapped.code, draftSwapped.version)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
    const draftStored = await draftRepository.findByCode(draftSwapped.code);
    if (draftStored === null) {
      throw new Error("fixture is missing the match");
    }
    expect(draftStored.version).toBe(draftSwapped.version);

    const { service: endedService } = makeService();
    const endedCreated = await endedService.create({ config, playerNames });
    const endedStarted = asView(
      await endedService.execute(endedCreated.code, endedCreated.version, { type: "start" }),
    );
    const ended = asView(await endedService.execute(endedStarted.code, endedStarted.version, { type: "end" }));

    await expect(endedService.undo(ended.code, ended.version)).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("S7 CEN-21: undo does not touch the timer", async () => {
    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service, repository } = makeService();
    const created = await service.create({ config, playerNames: sixNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const loserId = started.teams[1]?.id;
    if (loserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const won = asView(await service.execute(started.code, started.version, { type: "win", loserTeamId: loserId }));
    const stored = await repository.findByCode(won.code);
    if (stored === null) {
      throw new Error("fixture is missing the match");
    }
    const customTimer = { startedAt: new Date("2026-09-22T12:00:00.000Z"), elapsedMs: 120000 };
    const withTimer = await repository.updateTimer({
      matchId: stored.id,
      expectedVersion: stored.version,
      timer: customTimer,
    });

    const undone = await service.undo(won.code, withTimer.version);

    expect(undone.version).toBe(withTimer.version + 1);
    expect(undone.timer).toEqual({ startedAt: customTimer.startedAt.toISOString(), elapsedMs: 120000 });
  });

  it("S7 CEN-22: canUndo reflects whether /undo would actually succeed", async () => {
    const { service: draftService } = makeService();
    const draftCreated = await draftService.create({ config, playerNames });
    const draftPlayerA = draftCreated.teams[0]?.players[0];
    const draftPlayerB = draftCreated.teams[1]?.players[0];
    if (draftPlayerA === undefined || draftPlayerB === undefined) {
      throw new Error("fixture is missing players");
    }
    const draftSwapped = asView(
      await draftService.execute(draftCreated.code, draftCreated.version, {
        type: "swap",
        playerAId: draftPlayerA.id,
        playerBId: draftPlayerB.id,
      }),
    );
    expect(draftSwapped.canUndo).toBe(false);

    const { service: onlySwapService } = makeService();
    const onlySwapCreated = await onlySwapService.create({ config, playerNames });
    const onlySwapPlayerA = onlySwapCreated.teams[0]?.players[0];
    const onlySwapPlayerB = onlySwapCreated.teams[1]?.players[0];
    if (onlySwapPlayerA === undefined || onlySwapPlayerB === undefined) {
      throw new Error("fixture is missing players");
    }
    const onlySwapSwapped = asView(
      await onlySwapService.execute(onlySwapCreated.code, onlySwapCreated.version, {
        type: "swap",
        playerAId: onlySwapPlayerA.id,
        playerBId: onlySwapPlayerB.id,
      }),
    );
    const onlySwapStarted = asView(
      await onlySwapService.execute(onlySwapSwapped.code, onlySwapSwapped.version, { type: "start" }),
    );
    expect(onlySwapStarted.canUndo).toBe(false);

    const sixNames = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabio"];
    const { service: wonService } = makeService();
    const wonCreated = await wonService.create({ config, playerNames: sixNames });
    const wonStarted = asView(await wonService.execute(wonCreated.code, wonCreated.version, { type: "start" }));
    const wonLoserId = wonStarted.teams[1]?.id;
    if (wonLoserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const won = asView(
      await wonService.execute(wonStarted.code, wonStarted.version, { type: "win", loserTeamId: wonLoserId }),
    );
    expect(won.canUndo).toBe(true);
  });

  it("S7 CEN-23: undo logs the revoked event type, and rejection logs the domain code", async () => {
    const bigConfig: MatchConfig = { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 };
    const fourteenNames = Array.from({ length: 14 }, (_, index) => `Player${index}`);
    const { service, logger } = makeService();
    const created = await service.create({ config: bigConfig, playerNames: fourteenNames });
    const started = asView(await service.execute(created.code, created.version, { type: "start" }));
    const joined = asView(await service.execute(started.code, started.version, { type: "join", name: "Extra" }));

    const undone = await service.undo(joined.code, joined.version);

    expect(logger.info).toHaveBeenCalledWith({
      action: "undo",
      matchCode: joined.code,
      revokedEventType: "PLAYER_JOINED",
      version: undone.version,
    });

    await expect(service.undo(undone.code, undone.version)).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });
    expect(logger.warn).toHaveBeenCalledWith({
      action: "undo",
      matchCode: undone.code,
      code: "NOTHING_TO_UNDO",
    });
  });
});
