import { describe, it, expect } from "vitest";
import { assertValidState, InvariantViolation } from "./invariants";
import type { MatchState, Team, Player } from "./types";

function mkPlayer(id: string): Player {
  return { id, name: id };
}

function mkTeam(id: string, color: string | null, players: Player[]): Team {
  return { id, color, gameStreak: 0, players };
}

function mkState(teams: Team[], queue: Player[], colors: string[]): MatchState {
  return {
    status: "ACTIVE",
    config: { teamSize: 5, colors, gameMinutes: 10 },
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
