import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "./game-history";
import type { Event, MatchConfig, Player } from "./model";
import { DEFAULT_SPLIT_CONFIG } from "./model";
import { computeSplit, projectDepartedPlayers, splitDueAtMs } from "./split";

function entry(pays: boolean, paidCents: number): { pays: boolean; paidCents: number } {
  return { pays, paidCents };
}

function payers(count: number): { pays: boolean; paidCents: number }[] {
  return Array.from({ length: count }, () => entry(true, 0));
}

function historyEvent(seq: number, event: Event): HistoryEvent {
  return { seq, createdAt: new Date(2026, 0, seq), event };
}

describe("computeSplit", () => {
  it("splits the total evenly when nobody paid yet", () => {
    expect(computeSplit({ totalCents: 20000, entries: payers(16) })).toEqual({
      paidTotalCents: 0,
      remainingCents: 20000,
      payerCount: 16,
      perPersonCents: 1250,
    });
  });

  it("rounds the share up when the division leaves a remainder", () => {
    expect(computeSplit({ totalCents: 20000, entries: payers(15) })).toEqual({
      paidTotalCents: 0,
      remainingCents: 20000,
      payerCount: 15,
      perPersonCents: 1334,
    });
  });

  it("returns zero per person when nobody pays", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [entry(false, 0), entry(false, 0)],
      }),
    ).toEqual({
      paidTotalCents: 0,
      remainingCents: 20000,
      payerCount: 0,
      perPersonCents: 0,
    });
  });

  it("discounts what was already paid and divides it among those who still pay", () => {
    expect(
      computeSplit({
        totalCents: 3000,
        entries: [entry(true, 1000), entry(true, 1000), entry(true, 0)],
      }),
    ).toEqual({
      paidTotalCents: 2000,
      remainingCents: 1000,
      payerCount: 1,
      perPersonCents: 1000,
    });
  });

  it("discounts the paid value of an unmarked player", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [...payers(15), entry(false, 2000)],
      }),
    ).toEqual({
      paidTotalCents: 2000,
      remainingCents: 18000,
      payerCount: 15,
      perPersonCents: 1200,
    });
  });

  it("absorbs the share of someone unmarked with nothing paid", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [...payers(14), entry(false, 0)],
      }),
    ).toEqual({
      paidTotalCents: 0,
      remainingCents: 20000,
      payerCount: 14,
      perPersonCents: 1429,
    });
  });

  it("never leaves a negative remainder", () => {
    expect(
      computeSplit({
        totalCents: 20000,
        entries: [...payers(15), entry(true, 25000)],
      }),
    ).toEqual({
      paidTotalCents: 25000,
      remainingCents: 0,
      payerCount: 15,
      perPersonCents: 0,
    });
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
    ruleToggles: { arrivalPriority: false },
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
