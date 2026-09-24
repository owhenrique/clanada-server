import { describe, it, expect } from "vitest";
import { mkPlayer, makePlayers, teamId } from "./test-fixtures";
import { DomainError } from "../../shared/errors/domain-error";
import type { CommandContext, Player, MatchState, Team } from "./model";
import { formInitialState } from "./lineup";
import { swapPlayers, changeTeamSize, decideSwap, decideChangeTeamSize } from "./team-edits";

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

describe("CEN-9: swapPlayers", () => {
  it("swaps two players who are on different teams", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = swapPlayers(state, "p1", "p6");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p6",
      "p2",
      "p3",
      "p4",
    ]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual([
      "p5",
      "p1",
      "p7",
      "p8",
      "p9",
    ]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p11",
      "p12",
      "p13",
      "p14",
    ]);
  });

  it("swaps a team player with a queued player, each landing in the other's slot", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = swapPlayers(state, "p2", "p11");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p11",
      "p3",
      "p4",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p2"]);
  });

  it("swapping two players on the same team leaves the team's composition unchanged", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = swapPlayers(state, "p0", "p3");
    expect([...(next.teams[0]?.players.map((p) => p.id) ?? [])].sort()).toEqual([
      "p0",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
  });

  it("is a no-op when swapping a player with itself", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = swapPlayers(state, "p0", "p0");
    expect(next).toEqual(state);
  });

  it("is a no-op when either player id does not exist", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    expect(swapPlayers(state, "p0", "ghost")).toEqual(state);
    expect(swapPlayers(state, "ghost", "p0")).toEqual(state);
  });

  it("does not change bibs or match streaks of the teams involved", () => {
    const state = mkState(
      [mkTeam("t0", "verde", 3), mkTeam("t1", "vermelho", 1)],
      [],
      ["verde", "vermelho"],
    );
    const next = swapPlayers(state, "t0-0", "t1-0");
    expect(next.teams[0]?.color).toBe("verde");
    expect(next.teams[0]?.gameStreak).toBe(3);
    expect(next.teams[1]?.color).toBe("vermelho");
    expect(next.teams[1]?.gameStreak).toBe(1);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    swapPlayers(state, "p1", "p6");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${n++}`;
}

describe("CEN-8: changeTeamSize reduces the team size", () => {
  it("sends the last N-m players of every team to the queue, in rotation order, then compacts", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = changeTeamSize(state, 3, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.config.teamSize).toBe(3);
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1", "t2", "tNew0", "tNew1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(result.teams[0]?.color).toBe("verde");
    expect(result.teams[3]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p8"]);
    expect(result.teams[4]?.players.map((p) => p.id)).toEqual(["p9", "p13", "p14"]);
    expect(result.queue).toEqual([]);
  });
});

describe("CEN-9: changeTeamSize increases the team size with enough queue", () => {
  it("fills every team from the front of the queue, in rotation order, without forming a new team", () => {
    const base = formInitialState(makePlayers(6), { teamSize: 3, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: makePlayers(6, "q") };
    const next = changeTeamSize(state, 5, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "q0", "q1"]);
    expect(result.teams[1]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p5", "q2", "q3"]);
    expect(result.queue.map((p) => p.id)).toEqual(["q4", "q5"]);
  });
});

describe("CEN-10: changeTeamSize increases by dissolving teams from the end of the rotation", () => {
  it("dissolves the last team into the queue when there are not enough players to fill everyone", () => {
    const base = formInitialState(makePlayers(9), { teamSize: 3, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: makePlayers(1, "q") };
    const next = changeTeamSize(state, 5, idFactory("tNew"));
    expect(next).not.toBeNull();
    const result = next as MatchState;
    expect(result.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(result.teams[0]?.players.map((p) => p.id)).toEqual(["p0", "p1", "p2", "q0", "p6"]);
    expect(result.teams[1]?.players.map((p) => p.id)).toEqual(["p3", "p4", "p5", "p7", "p8"]);
    expect(result.queue).toEqual([]);
  });

  it("rejects when even dissolving everything cannot keep 2 teams", () => {
    const base = formInitialState(makePlayers(6), { teamSize: 3, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const result = changeTeamSize(base, 10, idFactory("tNew"));
    expect(result).toBeNull();
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    changeTeamSize(state, 3, idFactory("tNew"));
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-5/CEN-6: decideSwap", () => {
  function ctx(timerRunning: boolean): CommandContext {
    return { random: () => 0, nextId: () => "unused", timerRunning };
  }

  function activeState(): MatchState {
    const state = formInitialState(
      makePlayers(12),
      { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      (i) => `t${i}`,
    );
    return { ...state, status: "ACTIVE" };
  }

  it("CEN-5: rejects when a player on an on-field team is locked by the timer", () => {
    const state = activeState();
    expect(() =>
      decideSwap(
        state,
        { type: "swap", playerAId: "p0", playerBId: "p10" },
        ctx(true),
      ),
    ).toThrow(DomainError);
  });

  it("CEN-6: allows the swap when the timer is stopped", () => {
    const state = activeState();
    const result = decideSwap(
      state,
      { type: "swap", playerAId: "p0", playerBId: "p10" },
      ctx(false),
    );
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYERS_SWAPPED",
      playerAId: "p0",
      playerBId: "p10",
    });
  });

  it("does not lock a swap between two non-on-field players", () => {
    const state = activeState();
    const result = decideSwap(
      state,
      { type: "swap", playerAId: "p10", playerBId: "p11" },
      ctx(true),
    );
    expect("event" in result).toBe(true);
  });

  it("rejects a non-existent player", () => {
    const state = activeState();
    try {
      decideSwap(
        state,
        { type: "swap", playerAId: "p0", playerBId: "ghost" },
        ctx(false),
      );
      throw new Error("expected decideSwap to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_NOT_FOUND");
    }
  });
});

function activeState(count: number, teamSize: number): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean): CommandContext {
  return { random: () => 0, nextId: () => "tNovo", timerRunning };
}

describe("CEN-11: decideChangeTeamSize rejects when fewer than 2 teams would survive", () => {
  it("CEN-11: rejects with TEAM_SIZE_NOT_ALLOWED", () => {
    const state = activeState(6, 3);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 10 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });
});

describe("CEN-12: decideChangeTeamSize rejects invalid values", () => {
  it("CEN-12: rejects teamSize below 1", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 0 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });

  it("CEN-12: rejects a teamSize equal to the current one", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 5 }, ctx(false));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_SIZE_NOT_ALLOWED");
    }
  });
});

describe("CEN-13: decideChangeTeamSize rejects while the timer is running", () => {
  it("CEN-13: rejects with TIMER_RUNNING", () => {
    const state = activeState(10, 5);
    try {
      decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 4 }, ctx(true));
      throw new Error("expected decideChangeTeamSize to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TIMER_RUNNING");
    }
  });
});

describe("decideChangeTeamSize accepts a valid change", () => {
  it("produces TEAM_SIZE_CHANGED with the recorded new team ids", () => {
    const state = activeState(10, 5);
    const result = decideChangeTeamSize(state, { type: "changeTeamSize", teamSize: 4 }, ctx(false));
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "TEAM_SIZE_CHANGED",
      teamSize: 4,
      newTeamIds: [],
    });
  });
});
