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
  type Command,
  type CommandContext,
  type Event,
  type MatchConfig,
} from "../../../domain/match";
import { generateMatchCode } from "../repositories/match-code";
import { MatchCodeCollisionError, MatchesRepository, type StoredMatch } from "../repositories/matches.repository";
import { toMatchView, type MatchView } from "./match-view";

const MAX_CODE_ATTEMPTS = 5;

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
    @InjectPinoLogger(MatchesService.name) private readonly logger: PinoLogger,
  ) {}

  async create(input: { config: MatchConfig; playerNames: string[] }): Promise<MatchView> {
    try {
      const ctx = this.contextFor(false);
      const result = decide(null, { type: "create", playerNames: input.playerNames, config: input.config }, ctx);
      const event = requireEvent(result);
      const snapshot = applyEvent(null, event);
      assertValidState(snapshot);

      let lastError: unknown;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = generateMatchCode(this.randomSource);
        try {
          const stored = await this.repository.create({ code, event, snapshot });
          const view = await this.buildView(stored);
          this.logger.info({ action: "create", matchCode: stored.code, eventType: event.type, version: stored.version });
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
        this.logger.warn({ action: "create", matchCode: null, code: error.code });
      }
      throw error;
    }
  }

  async get(code: string): Promise<MatchView> {
    const stored = await this.repository.findByCode(code);
    if (stored === null) {
      throw new DomainError("MATCH_NOT_FOUND");
    }
    return this.buildView(stored);
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
          const fresh = await this.repository.findByCode(code);
          if (fresh === null) {
            throw new DomainError("MATCH_NOT_FOUND");
          }
          throw new VersionConflictError(await this.buildView(fresh));
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn({ action: command.type, matchCode: code, code: error.code });
      }
      throw error;
    }
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
