import { describe, it, expect } from "vitest";
import { mkPlayer } from "./test-fixtures";
import { assertValidState, InvariantViolation } from "./invariants";
import type { MatchState, Team, Player, Command, DecideResult, Event } from "./model";
import { decide, applyEvent, replay } from "./engine";
import { flattenPlayers } from "./lineup";
import { locatePlayer } from "./team-edits";
import { findDonorIndex } from "./roster";
import { DomainError } from "../../shared/errors/domain-error";

function mkTeam(id: string, color: string | null, players: Player[]): Team {
  return { id, color, gameStreak: 0, players };
}

function mkState(teams: Team[], queue: Player[], colors: string[]): MatchState {
  return {
    status: "ACTIVE",
    config: { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    teams,
    queue,
  };
}

function fullTeam(id: string, color: string | null): Team {
  return mkTeam(
    id,
    color,
    Array.from({ length: 5 }, (_, i) => mkPlayer(`${id}-${i}`)),
  );
}

describe("CEN-21 a CEN-26: assertValidState", () => {
  it("CEN-21: a duplicated player between a team and the queue throws DUPLICATE_PLAYER", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "vermelho")],
      [mkPlayer("t0-0")],
      ["verde", "vermelho"],
    );
    expect(() => assertValidState(state)).toThrow(InvariantViolation);
    try {
      assertValidState(state);
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("DUPLICATE_PLAYER");
    }
  });

  it("CEN-22: a team with teamSize - 1 players throws TEAM_SIZE_MISMATCH", () => {
    const short = mkTeam("t1", "vermelho", [
      mkPlayer("t1-0"),
      mkPlayer("t1-1"),
      mkPlayer("t1-2"),
      mkPlayer("t1-3"),
    ]);
    const state = mkState([fullTeam("t0", "verde"), short], [], ["verde", "vermelho"]);
    try {
      assertValidState(state);
      throw new Error("expected assertValidState to throw");
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("TEAM_SIZE_MISMATCH");
    }
  });

  it("CEN-23: a queue with teamSize players throws QUEUE_TOO_LONG", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "vermelho")],
      Array.from({ length: 5 }, (_, i) => mkPlayer(`q${i}`)),
      ["verde", "vermelho"],
    );
    try {
      assertValidState(state);
      throw new Error("expected assertValidState to throw");
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("QUEUE_TOO_LONG");
    }
  });

  it("CEN-24: two teams with the same color throw COLOR_REUSED", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "vermelho"), fullTeam("t2", "verde")],
      [],
      ["verde", "vermelho", "azul"],
    );
    try {
      assertValidState(state);
      throw new Error("expected assertValidState to throw");
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("COLOR_REUSED");
    }
  });

  it("CEN-25: more colored teams than colors.length throws COLOR_COUNT_EXCEEDS_LIMIT", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "vermelho"), fullTeam("t2", "azul")],
      [],
      ["verde", "vermelho"],
    );
    try {
      assertValidState(state);
      throw new Error("expected assertValidState to throw");
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("COLOR_COUNT_EXCEEDS_LIMIT");
    }
  });

  it("CEN-26: the two on-field teams sharing a color throws ON_FIELD_COLOR_CLASH", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "verde")],
      [],
      ["verde", "vermelho"],
    );
    try {
      assertValidState(state);
      throw new Error("expected assertValidState to throw");
    } catch (error) {
      expect((error as InvariantViolation).rule).toBe("ON_FIELD_COLOR_CLASH");
    }
  });

  it("does not throw for a valid state", () => {
    const state = mkState(
      [fullTeam("t0", "verde"), fullTeam("t1", "vermelho")],
      [mkPlayer("q0")],
      ["verde", "vermelho"],
    );
    expect(() => assertValidState(state)).not.toThrow();
  });
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${n++}`;
}

type ActiveOption = "swap" | "win" | "draw" | "join" | "leave" | "changeTeamSize";

function activeOptions(state: MatchState): ActiveOption[] {
  const options: ActiveOption[] = ["swap", "win", "draw", "changeTeamSize"];
  if (state.queue.length + 1 < state.config.teamSize) {
    options.push("join");
  }
  if (state.queue.length > 0 || state.teams.length > 2) {
    options.push("leave");
  }
  return options;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error("invariant: pick requires a non-empty list");
  }
  return item;
}

function pickPlayer(state: MatchState, rng: () => number): Player {
  return pick(flattenPlayers(state), rng);
}

function pickCommand(state: MatchState, rng: () => number): Command {
  if (state.status === "DRAFT") {
    return pick<Command>([{ type: "reshuffle" }, { type: "start" }], rng);
  }
  const option = pick(activeOptions(state), rng);
  switch (option) {
    case "swap": {
      const a = pickPlayer(state, rng);
      const b = pickPlayer(state, rng);
      return { type: "swap", playerAId: a.id, playerBId: b.id };
    }
    case "win": {
      const [first, second] = state.teams;
      if (first === undefined || second === undefined) {
        throw new Error("invariant: ACTIVE state requires two on-field teams");
      }
      return { type: "win", loserTeamId: rng() < 0.5 ? first.id : second.id };
    }
    case "draw":
      return { type: "draw" };
    case "join":
      return { type: "join", name: `Novo${Math.floor(rng() * 1_000_000)}` };
    case "leave": {
      const player = pickPlayer(state, rng);
      const location = locatePlayer(state, player.id);
      const needsFallback =
        location !== null &&
        location.kind === "team" &&
        state.queue.length === 0 &&
        findDonorIndex(state.teams.length, location.teamIndex) === null;
      return needsFallback
        ? { type: "leave", playerId: player.id, fallback: "reduce-team-size" }
        : { type: "leave", playerId: player.id };
    }
    case "changeTeamSize":
      return { type: "changeTeamSize", teamSize: 1 + Math.floor(rng() * 8) };
  }
}

describe("CEN-28 (S3) / CEN-14 (S4): property — 500 valid random commands never break an invariant", () => {
  it("CEN-28/CEN-14: keeps every invariant valid and matches an incremental replay, including leave fallbacks and team-size changes", () => {
    const rng = mulberry32(42);
    const ctx = { random: rng, nextId: idFactory("id"), timerRunning: false };

    const createResult = decide(
      null,
      {
        type: "create",
        playerNames: Array.from({ length: 22 }, (_, i) => `Player${i}`),
        config: { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 },
      },
      ctx,
    );
    if (!("event" in createResult)) {
      throw new Error("expected create to produce an event");
    }

    const events: Event[] = [createResult.event];
    let state = applyEvent(null, createResult.event);
    assertValidState(state);

    for (let step = 0; step < 500; step++) {
      const command = pickCommand(state, rng);
      let result: DecideResult;
      try {
        result = decide(state, command, ctx);
      } catch (error) {
        if (error instanceof DomainError && error.code === "TEAM_SIZE_NOT_ALLOWED") {
          continue;
        }
        throw error;
      }
      if ("penaltiesRequired" in result) {
        continue;
      }
      events.push(result.event);
      state = applyEvent(state, result.event);
      assertValidState(state);
    }

    expect(events.length).toBeGreaterThan(1);
    expect(replay(events)).toEqual(state);
  });
});
