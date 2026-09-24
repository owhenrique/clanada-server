import { describe, expect, it } from "vitest";
import {
  applyEvent,
  decide,
  UNDOABLE_EVENTS,
  type Event,
  type MatchConfig,
  type MatchState,
} from "../../../domain/match";
import type { CommandContext } from "../../../domain/match/commands/types";
import type { MatchesRepository } from "./matches.repository";

const config: MatchConfig = { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } };

function ctxFor(ids: readonly string[]): CommandContext {
  let index = 0;
  return {
    random: () => 0,
    nextId: () => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of fixture ids");
      }
      index += 1;
      return id;
    },
    timerRunning: false,
  };
}

function decideEvent(state: MatchState | null, command: Parameters<typeof decide>[1]): Event {
  const result = decide(state, command, ctxFor(["p5", "p6", "p7", "t2", "t3"]));
  if (!("event" in result)) {
    throw new Error("expected an event from decide()");
  }
  return result.event;
}

function createdFixture(): { event: Event; snapshot: MatchState } {
  const playerNames = ["A", "B", "C", "D", "E"];
  const ctx = ctxFor(["p0", "p1", "p2", "p3", "p4", "t0", "t1"]);
  const result = decide(null, { type: "create", playerNames, config }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event from decide()");
  }
  const snapshot = applyEvent(null, result.event);
  return { event: result.event, snapshot };
}

export function runMatchesRepositoryContract(
  implementationName: string,
  createRepository: () => MatchesRepository,
): void {
  describe(`MatchesRepository contract (${implementationName})`, () => {
    it("CEN-1: create stores the first event at version 1", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();

      const stored = await repository.create({ code: "AB23CD45", event, snapshot });

      expect(stored.version).toBe(1);
      expect(stored.status).toBe(snapshot.status);
      expect(stored.snapshot).toEqual(snapshot);

      const found = await repository.findByCode("AB23CD45");
      expect(found).toEqual(stored);

      const events = await repository.listActiveEvents(stored.id);
      expect(events).toEqual([{ seq: 1, event, createdAt: events[0]?.createdAt }]);
    });

    it("CEN-2: findByCode returns null for an unknown code", async () => {
      const repository = createRepository();

      const found = await repository.findByCode("ZZZZZZZZ");

      expect(found).toBeNull();
    });

    it("CEN-3: append with the right version advances it and persists the new snapshot", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN3CODE", event, snapshot });

      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);
      const joined = decideEvent(activeSnapshot, { type: "join", name: "F" });
      const joinedSnapshot = applyEvent(activeSnapshot, joined);

      await repository.append({
        matchId: created.id,
        expectedVersion: created.version,
        events: [started],
        snapshot: activeSnapshot,
      });
      const stored = await repository.append({
        matchId: created.id,
        expectedVersion: created.version + 1,
        events: [joined],
        snapshot: joinedSnapshot,
      });

      expect(stored.version).toBe(3);
      expect(stored.snapshot).toEqual(joinedSnapshot);

      const events = await repository.listActiveEvents(created.id);
      expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(events.map((e) => e.event.type)).toEqual(["MATCH_CREATED", "MATCH_STARTED", "PLAYER_JOINED"]);

      const found = await repository.findByCode("CEN3CODE");
      expect(found?.version).toBe(3);
    });

    it("CEN-4: append with the wrong version leaves state untouched and throws VERSION_CONFLICT", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN4CODE", event, snapshot });
      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);

      await expect(
        repository.append({
          matchId: created.id,
          expectedVersion: 0,
          events: [started],
          snapshot: activeSnapshot,
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const found = await repository.findByCode("CEN4CODE");
      expect(found?.version).toBe(1);
      const events = await repository.listActiveEvents(created.id);
      expect(events).toHaveLength(1);
    });

    it("CEN-5: append can reset the timer in the same write", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN5CODE", event, snapshot });
      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);
      await repository.append({
        matchId: created.id,
        expectedVersion: created.version,
        events: [started],
        snapshot: activeSnapshot,
      });
      await repository.updateTimer({
        matchId: created.id,
        expectedVersion: 2,
        timer: { startedAt: new Date("2026-01-01T10:00:00Z"), elapsedMs: 900000 },
      });

      const joined = decideEvent(activeSnapshot, { type: "join", name: "F" });
      const joinedSnapshot = applyEvent(activeSnapshot, joined);

      const stored = await repository.append({
        matchId: created.id,
        expectedVersion: 3,
        events: [joined],
        snapshot: joinedSnapshot,
        timer: { startedAt: null, elapsedMs: 0 },
      });

      expect(stored.timer).toEqual({ startedAt: null, elapsedMs: 0 });
    });

    it("CEN-6: revokeLast undoes the last undoable event", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN6CODE", event, snapshot });
      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);
      const afterStart = await repository.append({
        matchId: created.id,
        expectedVersion: created.version,
        events: [started],
        snapshot: activeSnapshot,
      });
      const joined = decideEvent(activeSnapshot, { type: "join", name: "F" });
      const joinedSnapshot = applyEvent(activeSnapshot, joined);
      const afterJoin = await repository.append({
        matchId: created.id,
        expectedVersion: afterStart.version,
        events: [joined],
        snapshot: joinedSnapshot,
      });

      const stored = await repository.revokeLast({
        matchId: created.id,
        expectedVersion: afterJoin.version,
        snapshot: activeSnapshot,
      });

      expect(stored.version).toBe(afterJoin.version + 1);
      expect(stored.snapshot).toEqual(activeSnapshot);

      const events = await repository.listActiveEvents(created.id);
      expect(events.map((e) => e.event.type)).toEqual(["MATCH_CREATED", "MATCH_STARTED"]);
    });

    it("CEN-7: revokeLast skips events that are not undoable", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN7CODE", event, snapshot });
      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);
      const afterStart = await repository.append({
        matchId: created.id,
        expectedVersion: created.version,
        events: [started],
        snapshot: activeSnapshot,
      });
      const joined = decideEvent(activeSnapshot, { type: "join", name: "F" });
      const joinedSnapshot = applyEvent(activeSnapshot, joined);
      const afterJoin = await repository.append({
        matchId: created.id,
        expectedVersion: afterStart.version,
        events: [joined],
        snapshot: joinedSnapshot,
      });
      const ended = decideEvent(joinedSnapshot, { type: "end" });
      const endedSnapshot = applyEvent(joinedSnapshot, ended);
      const afterEnd = await repository.append({
        matchId: created.id,
        expectedVersion: afterJoin.version,
        events: [ended],
        snapshot: endedSnapshot,
      });

      expect(UNDOABLE_EVENTS.has("MATCH_ENDED")).toBe(false);

      const stored = await repository.revokeLast({
        matchId: created.id,
        expectedVersion: afterEnd.version,
        snapshot: activeSnapshot,
      });

      expect(stored.snapshot).toEqual(activeSnapshot);
      const events = await repository.listActiveEvents(created.id);
      expect(events.map((e) => e.event.type)).toEqual(["MATCH_CREATED", "MATCH_STARTED", "MATCH_ENDED"]);
    });

    it("CEN-8: revokeLast with nothing undoable throws NOTHING_TO_UNDO and changes nothing", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN8CODE", event, snapshot });

      await expect(
        repository.revokeLast({ matchId: created.id, expectedVersion: created.version, snapshot }),
      ).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });

      const found = await repository.findByCode("CEN8CODE");
      expect(found?.version).toBe(1);
      const events = await repository.listActiveEvents(created.id);
      expect(events).toHaveLength(1);
    });

    it("CEN-9: updateTimer advances the version without touching events", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN9CODE", event, snapshot });

      const stored = await repository.updateTimer({
        matchId: created.id,
        expectedVersion: created.version,
        timer: { startedAt: new Date("2026-01-01T10:00:00Z"), elapsedMs: 0 },
      });

      expect(stored.version).toBe(2);
      expect(stored.timer.startedAt).toEqual(new Date("2026-01-01T10:00:00Z"));

      const events = await repository.listActiveEvents(created.id);
      expect(events).toHaveLength(1);
    });

    it("CEN-10: two simultaneous appends at the same version — exactly one wins", async () => {
      const repository = createRepository();
      const { event, snapshot } = createdFixture();
      const created = await repository.create({ code: "CEN10COD", event, snapshot });
      const started = decideEvent(snapshot, { type: "start" });
      const activeSnapshot = applyEvent(snapshot, started);

      const results = await Promise.allSettled([
        repository.append({
          matchId: created.id,
          expectedVersion: created.version,
          events: [started],
          snapshot: activeSnapshot,
        }),
        repository.append({
          matchId: created.id,
          expectedVersion: created.version,
          events: [started],
          snapshot: activeSnapshot,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const events = await repository.listActiveEvents(created.id);
      expect(events).toHaveLength(2);
    });
  });
}
