import { describe, it, expect } from "vitest";
import { DomainError } from "../../shared/errors/domain-error";
import type { CommandContext, MatchState, Player, Team, Event } from "./model";
import { DEFAULT_SPLIT_CONFIG } from "./model";
import { cascadePlayer, decideCascade } from "./cascade";
import { swapPlayers } from "./team-edits";
import { decide, applyEvent, replay } from "./engine";
import { assertValidState } from "./invariants";
import { flattenPlayers } from "./lineup";

const COLORS = ["verde", "vermelho", "azul", "amarelo"];

function player(arrival: number, withArrival = true): Player {
  return withArrival
    ? { id: `p${arrival}`, name: `P${arrival}`, arrival }
    : { id: `p${arrival}`, name: `P${arrival}` };
}

function team(index: number, arrivals: number[], withArrival = true): Team {
  return {
    id: `t${index}`,
    name: `Time${index}`,
    color: COLORS[index] ?? null,
    gameStreak: index,
    players: arrivals.map((arrival) => player(arrival, withArrival)),
  };
}

function state(
  teams: number[][],
  queue: number[],
  withArrival = true,
): MatchState {
  return {
    status: "ACTIVE",
    config: {
      teamSize: teams[0]?.length ?? 0,
      colors: COLORS,
      gameMinutes: 10,
      ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
      split: DEFAULT_SPLIT_CONFIG,
    },
    teams: teams.map((arrivals, index) => team(index, arrivals, withArrival)),
    queue: queue.map((arrival) => player(arrival, withArrival)),
    veteranTeamId: "t1",
  };
}

const base = (): MatchState =>
  state(
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ],
    [13, 14],
  );

function arrivalsOf(current: MatchState): {
  teams: number[][];
  queue: number[];
} {
  const toNumber = (p: Player): number => Number(p.id.slice(1));
  return {
    teams: current.teams.map((t) => t.players.map(toNumber)),
    queue: current.queue.map(toNumber),
  };
}

const ctx = (timerRunning = false): CommandContext => ({
  random: () => 0,
  nextId: () => "id",
  timerRunning,
});

describe("E7: cascadePlayer", () => {
  it("CEN-1: from the queue, every team passes its latest arrival down and the overflow goes to the queue", () => {
    expect(arrivalsOf(cascadePlayer(base(), "p13", "t0"))).toEqual({
      teams: [
        [1, 2, 13],
        [3, 4, 5],
        [6, 7, 8],
        [9, 10, 11],
      ],
      queue: [12, 14],
    });
  });

  it("CEN-2: from a team above, the cascade stops at the source team", () => {
    expect(arrivalsOf(cascadePlayer(base(), "p8", "t0"))).toEqual({
      teams: [
        [1, 2, 8],
        [3, 4, 5],
        [6, 7, 9],
        [10, 11, 12],
      ],
      queue: [13, 14],
    });
  });

  it("CEN-3: to a team below, the cascade goes up passing each team's earliest arrival", () => {
    expect(arrivalsOf(cascadePlayer(base(), "p2", "t2"))).toEqual({
      teams: [
        [1, 3, 4],
        [5, 6, 7],
        [2, 8, 9],
        [10, 11, 12],
      ],
      queue: [13, 14],
    });
  });

  it("CEN-4: the leaver is the latest arrival, not the last in the list", () => {
    const swapped = swapPlayers(base(), "p1", "p4");
    expect(arrivalsOf(swapped).teams.slice(0, 2)).toEqual([
      [4, 2, 3],
      [1, 5, 6],
    ]);
    expect(arrivalsOf(cascadePlayer(swapped, "p13", "t0"))).toEqual({
      teams: [
        [2, 3, 13],
        [1, 4, 5],
        [6, 7, 8],
        [9, 10, 11],
      ],
      queue: [12, 14],
    });
  });

  it("CEN-5: the incoming player enters before the first one who arrived after them", () => {
    const current = state(
      [
        [5, 3, 1],
        [2, 9, 8],
      ],
      [],
    );
    expect(arrivalsOf(cascadePlayer(current, "p2", "t0")).teams).toEqual([
      [2, 3, 1],
      [5, 9, 8],
    ]);
    const unsorted = state(
      [
        [3, 1],
        [5, 9],
        [2, 4],
      ],
      [],
    );
    expect(arrivalsOf(cascadePlayer(unsorted, "p2", "t1")).teams).toEqual([
      [3, 1],
      [2, 5],
      [4, 9],
    ]);
  });

  it("CEN-5: the overflow enters the queue in arrival order", () => {
    const current = state(
      [
        [1, 2],
        [3, 4],
      ],
      [6, 5],
    );
    expect(arrivalsOf(cascadePlayer(current, "p5", "t0"))).toEqual({
      teams: [
        [1, 5],
        [2, 3],
      ],
      queue: [4, 6],
    });
  });

  it("CEN-7: team id, name, bib, game streak and veteran stay with the team", () => {
    const before = base();
    const after = cascadePlayer(before, "p13", "t0");
    const identity = (s: MatchState): object[] =>
      s.teams.map(({ id, name, color, gameStreak }) => ({
        id,
        name,
        color,
        gameStreak,
      }));
    expect(identity(after)).toEqual(identity(before));
    expect(after.veteranTeamId).toBe("t1");
  });

  it("CEN-11: without recorded arrivals, the effective arrival order is used", () => {
    const legacy = state(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      [7],
      false,
    );
    expect(arrivalsOf(cascadePlayer(legacy, "p7", "t0"))).toEqual({
      teams: [
        [1, 2, 7],
        [3, 4, 5],
      ],
      queue: [6],
    });
  });
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

describe("E7 CEN-6: property — no duplicates, no losses, sizes kept", () => {
  it("holds for 1000 random states and moves", () => {
    const rng = mulberry32(7);
    for (let run = 0; run < 1000; run++) {
      const size = 1 + Math.floor(rng() * 5);
      const teamCount = 2 + Math.floor(rng() * 5);
      const queueLength = Math.floor(rng() * size);
      const arrivals = shuffled(
        Array.from({ length: size * teamCount + queueLength }, (_, i) => i + 1),
        rng,
      );
      const teams = Array.from({ length: teamCount }, (_, i) =>
        arrivals.slice(i * size, (i + 1) * size),
      );
      const current = state(teams, arrivals.slice(size * teamCount));
      const moved = flattenPlayers(current)[
        Math.floor(rng() * arrivals.length)
      ] as Player;
      const target = current.teams[Math.floor(rng() * teamCount)] as Team;
      const source = current.teams.findIndex((t) =>
        t.players.some((p) => p.id === moved.id),
      );
      const targetIndex = Number(target.id.slice(1));
      if (source === targetIndex) {
        continue;
      }

      const next = cascadePlayer(current, moved.id, target.id);

      assertValidState(next);
      const ids = (s: MatchState): string[] =>
        flattenPlayers(s)
          .map((p) => p.id)
          .sort();
      expect(ids(next)).toEqual(ids(current));
      expect(next.teams.map((t) => t.players.length)).toEqual(
        current.teams.map(() => size),
      );
      expect(next.queue.length).toBe(current.queue.length);
      expect(
        next.teams[targetIndex]?.players.some((p) => p.id === moved.id),
      ).toBe(true);
      const low = source === -1 ? targetIndex : Math.min(source, targetIndex);
      const high =
        source === -1 ? teamCount - 1 : Math.max(source, targetIndex);
      next.teams.forEach((t, index) => {
        if (index < low || index > high) {
          expect(t).toEqual(current.teams[index]);
        }
      });
      if (source !== -1) {
        expect(next.queue).toEqual(current.queue);
      }
    }
  });
});

describe("E7: decideCascade", () => {
  it("CEN-9: rejects an unknown player, an unknown team and the player's own team", () => {
    expect(() =>
      decideCascade(
        base(),
        { type: "cascade", playerId: "x", targetTeamId: "t0" },
        ctx(),
      ),
    ).toThrow(new DomainError("PLAYER_NOT_FOUND"));
    expect(() =>
      decideCascade(
        base(),
        { type: "cascade", playerId: "p13", targetTeamId: "x" },
        ctx(),
      ),
    ).toThrow(new DomainError("CASCADE_NOT_ALLOWED"));
    expect(() =>
      decideCascade(
        base(),
        { type: "cascade", playerId: "p8", targetTeamId: "t2" },
        ctx(),
      ),
    ).toThrow(new DomainError("CASCADE_NOT_ALLOWED"));
  });

  it("CEN-8: with the timer running, refuses when the cascade passes through an on-field team", () => {
    const locked = (playerId: string, targetTeamId: string) => () =>
      decideCascade(
        base(),
        { type: "cascade", playerId, targetTeamId },
        ctx(true),
      );
    expect(locked("p8", "t0")).toThrow(new DomainError("PLAYER_LOCKED"));
    expect(locked("p13", "t1")).toThrow(new DomainError("PLAYER_LOCKED"));
    expect(locked("p2", "t2")).toThrow(new DomainError("PLAYER_LOCKED"));
    expect(locked("p13", "t2")).not.toThrow();
    expect(locked("p11", "t2")).not.toThrow();
  });

  it("records PLAYER_CASCADED in draft and active matches", () => {
    const draft = { ...base(), status: "DRAFT" as const };
    expect(
      decide(
        draft,
        { type: "cascade", playerId: "p13", targetTeamId: "t0" },
        ctx(),
      ),
    ).toEqual({
      event: { type: "PLAYER_CASCADED", playerId: "p13", targetTeamId: "t0" },
    });
  });

  it("CEN-10/CEN-11: replaying without the event restores teams and queue at once", () => {
    const created = decide(
      null,
      {
        type: "create",
        playerNames: Array.from({ length: 14 }, (_, i) => `J${i + 1}`),
        config: { teamSize: 3, colors: COLORS, gameMinutes: 10 },
      },
      {
        random: mulberry32(1),
        nextId: (() => {
          let n = 0;
          return () => `id${n++}`;
        })(),
        timerRunning: false,
      },
    );
    if (!("event" in created)) throw new Error("expected create event");
    const events: Event[] = [created.event];
    const before = replay(events);
    const moved = before.queue[0] as Player;
    const result = decide(
      before,
      {
        type: "cascade",
        playerId: moved.id,
        targetTeamId: (before.teams[0] as Team).id,
      },
      ctx(),
    );
    if (!("event" in result)) throw new Error("expected cascade event");
    const after = applyEvent(before, result.event);
    expect(after).not.toEqual(before);
    expect(replay([...events, result.event])).toEqual(after);
    expect(replay(events)).toEqual(before);
  });
});
