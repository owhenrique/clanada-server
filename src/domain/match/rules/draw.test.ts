import { describe, it, expect } from "vitest";
import { resolveDraw } from "./draw";
import type { Player, MatchState, Team } from "../types";

function mkPlayer(id: string): Player {
  return { id, name: id };
}

function mkTeam(id: string, color: string | null, gameStreak: number): Team {
  return {
    id,
    color,
    gameStreak,
    players: Array.from({ length: 5 }, (_, i) => mkPlayer(`${id}-${i}`)),
  };
}

function mkState(teams: Team[], queue: Player[], colors: string[]): MatchState {
  return {
    status: "ACTIVE",
    config: { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    teams,
    queue,
  };
}

function idGen(): () => string {
  let n = 0;
  return () => `n${n++}`;
}

describe("CEN-4: resolveDraw — penalties", () => {
  it("goes to penalties when there are fewer than two complete waiting teams", () => {
    const state = mkState(
      [mkTeam("t0", null, 0), mkTeam("t1", null, 0), mkTeam("t2", null, 0)],
      [],
      ["verde", "vermelho"],
    );
    expect(resolveDraw(state, () => 0, idGen()).type).toBe("penalties");
  });

  it("goes to penalties even with a queue when there are not two complete waiting teams", () => {
    const state = mkState(
      [mkTeam("t0", null, 0), mkTeam("t1", null, 0)],
      [mkPlayer("q0"), mkPlayer("q1")],
      ["verde", "vermelho"],
    );
    expect(resolveDraw(state, () => 0, idGen()).type).toBe("penalties");
  });
});

describe("CEN-5: resolveDraw — swap", () => {
  it("the next two teams enter and the leavers reform at the back", () => {
    const state = mkState(
      [
        mkTeam("t0", null, 0),
        mkTeam("t1", null, 0),
        mkTeam("t2", null, 0),
        mkTeam("t3", null, 0),
      ],
      [],
      ["verde", "vermelho", "azul"],
    );
    const outcome = resolveDraw(state, () => 0, idGen());
    expect(outcome.type).toBe("swap");
    if (outcome.type !== "swap") {
      return;
    }
    expect(outcome.state.teams.map((t) => t.id)).toEqual([
      "t2",
      "t3",
      "n0",
      "n1",
    ]);
    expect(outcome.state.teams[2]?.players.map((p) => p.id)).toEqual([
      "t0-0",
      "t0-1",
      "t0-2",
      "t0-3",
      "t0-4",
    ]);
    expect(outcome.state.teams[3]?.players.map((p) => p.id)).toEqual([
      "t1-0",
      "t1-1",
      "t1-2",
      "t1-3",
      "t1-4",
    ]);
    expect(outcome.state.queue).toEqual([]);
  });

  it("draws which of the two leaving teams reforms first", () => {
    const state = mkState(
      [
        mkTeam("t0", null, 0),
        mkTeam("t1", null, 0),
        mkTeam("t2", null, 0),
        mkTeam("t3", null, 0),
      ],
      [],
      ["verde", "vermelho", "azul"],
    );
    const low = resolveDraw(state, () => 0, idGen());
    const high = resolveDraw(state, () => 0.9, idGen());
    if (low.type === "swap") {
      expect(low.state.teams[2]?.players[0]?.id).toBe("t0-0");
    }
    if (high.type === "swap") {
      expect(high.state.teams[2]?.players[0]?.id).toBe("t1-0");
    }
  });

  it("keeps remaining waiting teams and reassigns bibs", () => {
    const state = mkState(
      [
        mkTeam("t0", "verde", 0),
        mkTeam("t1", "vermelho", 0),
        mkTeam("t2", "azul", 0),
        mkTeam("t3", null, 0),
        mkTeam("t4", null, 0),
      ],
      [],
      ["verde", "vermelho", "azul"],
    );
    const outcome = resolveDraw(state, () => 0, idGen());
    expect(outcome.type).toBe("swap");
    if (outcome.type !== "swap") {
      return;
    }
    expect(outcome.state.teams.map((t) => t.id)).toEqual([
      "t2",
      "t3",
      "t4",
      "n0",
      "n1",
    ]);
    expect(outcome.state.teams.map((t) => t.color)).toEqual([
      "azul",
      "verde",
      "vermelho",
      null,
      null,
    ]);
    expect(outcome.state.queue).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = mkState(
      [
        mkTeam("t0", null, 3),
        mkTeam("t1", null, 1),
        mkTeam("t2", null, 0),
        mkTeam("t3", null, 0),
      ],
      [],
      ["verde", "vermelho", "azul"],
    );
    const snapshot = JSON.stringify(state);
    resolveDraw(state, () => 0, idGen());
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
