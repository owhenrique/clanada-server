import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Clock } from "../../../shared/ports/clock";
import { IdGenerator } from "../../../shared/ports/id-generator";
import { RandomSource } from "../../../shared/ports/random-source";
import { DomainError, VersionConflictError } from "../../../shared/errors/domain-error";
import {
  applyEvent,
  assertValidState,
  decide,
  receivedLimitCents,
  replay,
  splitDueAtMs,
  type Command,
  type CommandContext,
  type Event,
  type CreateMatchConfig,
} from "../../../domain/match";
import { GameHistoryRepository } from "../repositories/game-history.repository";
import { generateMatchCode } from "../repositories/match-code";
import {
  MatchCodeCollisionError,
  MatchesRepository,
  type StoredEvent,
  type StoredMatch,
} from "../repositories/matches.repository";
import { toGameView, type GameView } from "./game-view";
import {
  findMatchStartedAt,
  splitEntryFromInput,
  splitRosterIds,
  toSplitView,
  type SplitEntryInput,
  type SplitView,
} from "./split-view";
import { toMatchView, type MatchView } from "./match-view";
import { applyTimerAction, type TimerAction } from "./timer";
import { findUndoableTarget } from "./undoable-target";

const MAX_CODE_ATTEMPTS = 5;

const TIMER_RESET_EVENT_TYPES: ReadonlySet<Event["type"]> = new Set(["GAME_WON", "GAME_DRAWN"]);

function requireEvent(result: { event: Event } | { penaltiesRequired: true }): Event {
  if ("event" in result) {
    return result.event;
  }
  throw new Error("invariant: create never returns penaltiesRequired");
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly repository: MatchesRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly randomSource: RandomSource,
    private readonly gameHistory: GameHistoryRepository,
    @InjectPinoLogger(MatchesService.name) private readonly logger: PinoLogger,
  ) {}

  async create(input: { config: CreateMatchConfig; playerNames: string[] }): Promise<MatchView> {
    try {
      const ctx = this.contextFor(false);
      const result = decide(
        null,
        {
          type: "create",
          playerNames: input.playerNames,
          config: input.config,
        },
        ctx,
      );
      const event = requireEvent(result);
      const snapshot = applyEvent(null, event);
      assertValidState(snapshot);

      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = generateMatchCode(this.randomSource);
        try {
          const stored = await this.repository.create({
            code,
            event,
            snapshot,
          });
          const view = await this.buildView(stored);
          this.logger.info({
            action: "create",
            matchCode: stored.code,
            eventType: event.type,
            version: stored.version,
          });
          return view;
        } catch (error) {
          if (error instanceof MatchCodeCollisionError) {
            lastError = error;
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({
          action: "create",
          matchCode: null,
          code: error.code,
        });
      }
      throw error;
    }
  }

  async get(code: string): Promise<MatchView> {
    return this.buildView(await this.lookup(code));
  }

  async listGames(code: string): Promise<GameView[]> {
    const stored = await this.lookup(code);
    const records = await this.gameHistory.listByMatchId(stored.id);
    return records.map(toGameView);
  }

  async getSplit(code: string): Promise<SplitView> {
    const action = "split.get";
    try {
      const stored = await this.lookup(code);
      const activeEvents = await this.repository.listActiveEvents(stored.id);
      this.assertSplitReady(stored, activeEvents);
      return toSplitView(stored, activeEvents);
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ action, matchCode: code, code: error.code });
      }
      throw error;
    }
  }

  async setSplitPlayer(
    code: string,
    playerId: string,
    input: SplitEntryInput,
  ): Promise<SplitView> {
    const action = "split.setPlayer";
    try {
      const stored = await this.lookup(code);
      const activeEvents = await this.repository.listActiveEvents(stored.id);
      this.assertSplitReady(stored, activeEvents);
      if (!splitRosterIds(stored, activeEvents).has(playerId)) {
        throw new DomainError("PLAYER_NOT_FOUND");
      }
      const current = toSplitView(stored, activeEvents);
      const entry = splitEntryFromInput(input, current.perPersonCents);
      const currentRow = current.players.find((player) => player.id === playerId);
      if (
        currentRow !== undefined &&
        entry.receivedCents > receivedLimitCents(currentRow.receivedCents, current.pendingCents)
      ) {
        throw new DomainError("SPLIT_VALUE_EXCEEDS_TOTAL");
      }
      const players = { ...(stored.split?.players ?? {}), [playerId]: entry };
      const updated = await this.repository.updateSplit({
        matchId: stored.id,
        split: { players },
      });
      this.logger.info({
        action,
        matchCode: updated.code,
        playerId,
        pays: entry.pays,
        received: entry.received,
        receivedCents: entry.receivedCents,
      });
      return toSplitView(updated, activeEvents);
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ action, matchCode: code, code: error.code });
      }
      throw error;
    }
  }

  private async lookup(code: string): Promise<StoredMatch> {
    const stored = await this.repository.findByCode(code);
    if (stored === null) {
      throw new DomainError("MATCH_NOT_FOUND");
    }
    return stored;
  }

  private assertSplitReady(stored: StoredMatch, activeEvents: readonly StoredEvent[]): void {
    if (!stored.snapshot.config.split.enabled) {
      throw new DomainError("SPLIT_DISABLED");
    }
    if (stored.status === "DRAFT") {
      throw new DomainError("INVALID_STATUS");
    }
    if (stored.status !== "ACTIVE") {
      return;
    }
    const startedAt = findMatchStartedAt(activeEvents);
    if (startedAt === null) {
      throw new DomainError("SPLIT_NOT_READY");
    }
    const dueAtMs = splitDueAtMs(startedAt.getTime(), stored.snapshot.config.split.durationMinutes);
    if (this.clock.now().getTime() < dueAtMs) {
      throw new DomainError("SPLIT_NOT_READY");
    }
  }

  async timer(code: string, expectedVersion: number, timerAction: TimerAction): Promise<MatchView> {
    const action = `timer.${timerAction}`;
    try {
      const stored = await this.repository.findByCode(code);
      if (stored === null) {
        throw new DomainError("MATCH_NOT_FOUND");
      }
      if (stored.version !== expectedVersion) {
        throw new VersionConflictError(await this.buildView(stored));
      }
      if (stored.status !== "ACTIVE") {
        throw new DomainError("INVALID_STATUS");
      }

      const timer = applyTimerAction(stored.timer, timerAction, this.clock.now());
      if (timer === stored.timer) {
        return await this.buildView(stored);
      }

      try {
        const updated = await this.repository.updateTimer({
          matchId: stored.id,
          expectedVersion,
          timer,
        });
        const view = await this.buildView(updated);
        this.logger.info({
          action,
          matchCode: updated.code,
          version: updated.version,
        });
        return view;
      } catch (error) {
        if (error instanceof DomainError && error.code === "VERSION_CONFLICT") {
          throw await this.freshVersionConflict(code);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ action, matchCode: code, code: error.code });
      }
      throw error;
    }
  }

  async execute(
    code: string,
    expectedVersion: number,
    command: Command,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    try {
      const stored = await this.repository.findByCode(code);
      if (stored === null) {
        throw new DomainError("MATCH_NOT_FOUND");
      }
      if (stored.version !== expectedVersion) {
        throw new VersionConflictError(await this.buildView(stored));
      }

      const ctx = this.contextFor(stored.timer.startedAt !== null);
      const result = decide(stored.snapshot, command, ctx);
      if ("penaltiesRequired" in result) {
        return result;
      }

      const snapshot = applyEvent(stored.snapshot, result.event);
      assertValidState(snapshot);

      try {
        const updated = await this.repository.append({
          matchId: stored.id,
          expectedVersion,
          events: [result.event],
          snapshot,
          ...(TIMER_RESET_EVENT_TYPES.has(result.event.type)
            ? { timer: { startedAt: null, elapsedMs: 0 } }
            : {}),
        });
        const view = await this.buildView(updated);
        this.logger.info({
          action: command.type,
          matchCode: updated.code,
          eventType: result.event.type,
          version: updated.version,
        });
        return view;
      } catch (error) {
        if (error instanceof DomainError && error.code === "VERSION_CONFLICT") {
          throw await this.freshVersionConflict(code);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({
          action: command.type,
          matchCode: code,
          code: error.code,
        });
      }
      throw error;
    }
  }

  async undo(code: string, expectedVersion: number): Promise<MatchView> {
    try {
      const stored = await this.repository.findByCode(code);
      if (stored === null) {
        throw new DomainError("MATCH_NOT_FOUND");
      }
      if (stored.version !== expectedVersion) {
        throw new VersionConflictError(await this.buildView(stored));
      }
      if (stored.status !== "ACTIVE") {
        throw new DomainError("INVALID_STATUS");
      }

      const activeEvents = await this.repository.listActiveEvents(stored.id);
      const targetIndex = findUndoableTarget(activeEvents);
      if (targetIndex === -1) {
        throw new DomainError("NOTHING_TO_UNDO");
      }
      const target = activeEvents[targetIndex];
      if (target === undefined) {
        throw new Error("invariant: findUndoableTarget returned an out-of-range index");
      }

      const remainingEvents = activeEvents
        .filter((_, index) => index !== targetIndex)
        .map((stored) => stored.event);
      const snapshot = replay(remainingEvents);
      assertValidState(snapshot);

      try {
        const updated = await this.repository.revokeLast({
          matchId: stored.id,
          expectedVersion,
          snapshot,
        });
        const view = await this.buildView(updated);
        this.logger.info({
          action: "undo",
          matchCode: updated.code,
          revokedEventType: target.event.type,
          version: updated.version,
        });
        return view;
      } catch (error) {
        if (error instanceof DomainError && error.code === "VERSION_CONFLICT") {
          throw await this.freshVersionConflict(code);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ action: "undo", matchCode: code, code: error.code });
      }
      throw error;
    }
  }

  private async freshVersionConflict(code: string): Promise<DomainError> {
    const fresh = await this.repository.findByCode(code);
    if (fresh === null) {
      return new DomainError("MATCH_NOT_FOUND");
    }
    return new VersionConflictError(await this.buildView(fresh));
  }

  private async buildView(stored: StoredMatch): Promise<MatchView> {
    const activeEvents = await this.repository.listActiveEvents(stored.id);
    return toMatchView(stored, activeEvents, this.clock.now());
  }

  private contextFor(timerRunning: boolean): CommandContext {
    return {
      random: () => this.randomSource.next(),
      nextId: () => this.idGenerator.next(),
      timerRunning,
    };
  }
}
