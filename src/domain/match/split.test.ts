import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "./game-history";
import type { Event, MatchConfig, Player } from "./model";
import { DEFAULT_SPLIT_CONFIG, UNDOABLE_EVENTS } from "./model";
import { applyEvent, decide, replay } from "./engine";
import { idGen, makePlayers } from "./test-fixtures";
import { computeSplit, projectDepartedPlayers, receivedLimitCents, splitDueAtMs } from "./split";
import type { SplitEntry } from "./split";

function payer(receivedCents = 0): SplitEntry {
  return { pays: true, received: receivedCents > 0, receivedCents };
}

function out(): SplitEntry {
  return { pays: false, received: false, receivedCents: 0 };
}

function payers(count: number): SplitEntry[] {
  return Array.from({ length: count }, () => payer());
}

function historyEvent(seq: number, event: Event): HistoryEvent {
  return { seq, createdAt: new Date(2026, 0, seq), event };
}

describe("computeSplit", () => {
  it("splits the total evenly when nobody received yet", () => {
    expect(computeSplit({ totalCents: 200000, entries: payers(16) })).toEqual({
      receivedTotalCents: 0,
      remainingCents: 200000,
      payerCount: 16,
      pendingCount: 16,
      perPersonCents: 12500,
    });
  });

  it("redistributes the share of someone out of the division", () => {
    expect(computeSplit({ totalCents: 200000, entries: [...payers(15), out()] })).toEqual({
      receivedTotalCents: 0,
      remainingCents: 200000,
      payerCount: 15,
      pendingCount: 15,
      perPersonCents: 13334,
    });
  });

  it("discounts a partial receipt and divides it among the remaining pending players", () => {
    expect(
      computeSplit({
        totalCents: 200000,
        entries: [...payers(15), payer(10000)],
      }),
    ).toEqual({
      receivedTotalCents: 10000,
      remainingCents: 190000,
      payerCount: 16,
      pendingCount: 15,
      perPersonCents: 12667,
    });
  });

  it("counts the full amount when someone receives more than the share", () => {
    expect(
      computeSplit({
        totalCents: 200000,
        entries: [...payers(15), payer(15000)],
      }),
    ).toEqual({
      receivedTotalCents: 15000,
      remainingCents: 185000,
      payerCount: 16,
      pendingCount: 15,
      perPersonCents: 12334,
    });
  });

  it("returns zero per person when everybody received", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [payer(10000), payer(10000)],
      }),
    ).toEqual({
      receivedTotalCents: 20000,
      remainingCents: 0,
      payerCount: 2,
      pendingCount: 0,
      perPersonCents: 0,
    });
  });

  it("returns zero per person when nobody pays", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [out(), out()],
      }),
    ).toEqual({
      receivedTotalCents: 0,
      remainingCents: 20000,
      payerCount: 0,
      pendingCount: 0,
      perPersonCents: 0,
    });
  });

  it("never leaves a negative remainder", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [payer(15000), payer(15000)],
      }),
    ).toEqual({
      receivedTotalCents: 30000,
      remainingCents: 0,
      payerCount: 2,
      pendingCount: 0,
      perPersonCents: 0,
    });
  });

  it("rounds the share up to at least one cent", () => {
    expect(computeSplit({ totalCents: 2, entries: payers(3) })).toEqual({
      receivedTotalCents: 0,
      remainingCents: 2,
      payerCount: 3,
      pendingCount: 3,
      perPersonCents: 1,
    });
  });
});

describe("receivedLimitCents", () => {
  it("adds what the player already received to the pending total", () => {
    expect(receivedLimitCents(12500, 12500)).toBe(25000);
    expect(receivedLimitCents(0, 20000)).toBe(20000);
  });

  it("keeps only the current value when nothing is pending anymore", () => {
    expect(receivedLimitCents(12500, 0)).toBe(12500);
    expect(receivedLimitCents(25000, 0)).toBe(25000);
  });
});

describe("splitDueAtMs", () => {
  it("returns the start plus half of the pelada duration", () => {
    expect(splitDueAtMs(1000000, 120)).toBe(4600000);
    expect(splitDueAtMs(1000000, 45)).toBe(2350000);
  });
});

describe("projectDepartedPlayers", () => {
  const players: Player[] = [
    { id: "p0", name: "P0" },
    { id: "p1", name: "P1" },
    { id: "p2", name: "P2" },
  ];
  const config: MatchConfig = {
    teamSize: 5,
    colors: ["verde", "vermelho"],
    gameMinutes: 10,
    ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
    split: DEFAULT_SPLIT_CONFIG,
  };
  const created = historyEvent(1, {
    type: "MATCH_CREATED",
    config,
    players,
    teamIds: [],
  });
  const joined = historyEvent(2, {
    type: "PLAYER_JOINED",
    player: { id: "p9", name: "P9" },
    newTeamIds: [],
  });

  it("lists departed players by name in leave order", () => {
    const events = [
      created,
      historyEvent(2, {
        type: "PLAYER_LEFT",
        playerId: "p2",
        fallback: "none",
        newTeamIds: [],
      }),
      historyEvent(3, {
        type: "PLAYER_LEFT",
        playerId: "p1",
        fallback: "none",
        newTeamIds: [],
      }),
    ];
    expect(projectDepartedPlayers(events)).toEqual([
      { id: "p2", name: "P2" },
      { id: "p1", name: "P1" },
    ]);
  });

  it("names players who joined later", () => {
    const events = [
      created,
      joined,
      historyEvent(3, {
        type: "PLAYER_LEFT",
        playerId: "p9",
        fallback: "none",
        newTeamIds: [],
      }),
    ];
    expect(projectDepartedPlayers(events)).toEqual([{ id: "p9", name: "P9" }]);
  });

  it("keeps a player out while their leave is not in the log", () => {
    expect(projectDepartedPlayers([created, joined])).toEqual([]);
  });
});

describe("enableSplit", () => {
  const baseConfig: MatchConfig = {
    teamSize: 1,
    colors: ["red", "blue"],
    gameMinutes: 7,
    ruleToggles: { arrivalPriority: true, drawKeepsVeteran: false },
    split: DEFAULT_SPLIT_CONFIG,
  };
  const players = makePlayers(2);
  const ctx = { random: () => 0, nextId: idGen(), timerRunning: false };
  const created = replay([
    { type: "MATCH_CREATED", config: baseConfig, players, teamIds: ["t0", "t1"] },
    { type: "MATCH_STARTED" },
  ]);

  it("enables the split with the given values", () => {
    const result = decide(created, { type: "enableSplit", hourlyRateCents: 15000, durationMinutes: 90 }, ctx);
    if (!("event" in result)) {
      throw new Error("expected event");
    }
    const next = applyEvent(created, result.event);
    expect(next.config.split).toEqual({ enabled: true, hourlyRateCents: 15000, durationMinutes: 90 });
  });

  it("rejects values outside the configuration ranges", () => {
    for (const [rate, minutes] of [[0, 120], [100001, 120], [10000, 20], [10000, 100]] as const) {
      expect(() =>
        decide(created, { type: "enableSplit", hourlyRateCents: rate, durationMinutes: minutes }, ctx),
      ).toThrowError("SPLIT_INVALID_CONFIG");
    }
  });

  it("rejects enabling twice", () => {
    const enabled = applyEvent(created, {
      type: "SPLIT_ENABLED",
      hourlyRateCents: 10000,
      durationMinutes: 120,
    });
    expect(() =>
      decide(enabled, { type: "enableSplit", hourlyRateCents: 10000, durationMinutes: 120 }, ctx),
    ).toThrowError("SPLIT_ALREADY_ENABLED");
  });

  it("rejects enabling outside an active match", () => {
    const ended = applyEvent(created, { type: "MATCH_ENDED" });
    expect(() =>
      decide(ended, { type: "enableSplit", hourlyRateCents: 10000, durationMinutes: 120 }, ctx),
    ).toThrowError("INVALID_STATUS");
  });

  it("is undoable", () => {
    expect(UNDOABLE_EVENTS.has("SPLIT_ENABLED")).toBe(true);
  });
});
