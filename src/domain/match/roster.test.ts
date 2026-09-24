import { describe, it, expect } from "vitest";
import { mkPlayer, makePlayers, teamId } from "./test-fixtures";
import { DomainError } from "../../shared/errors/domain-error";
import type { CommandContext, MatchState } from "./model";
import { formInitialState } from "./lineup";
import {
  playerJoins,
  playerLeaves,
  playerLeavesWithReducedTeamSize,
  findDonorIndex,
  decideJoin,
  decideLeave,
} from "./roster";

describe("CEN-7: playerJoins without completing the queue", () => {
  it("CEN-7: appends the new player to the end of the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerJoins(state, mkPlayer("pX"), () => "tNovo");
    expect(next.queue.map((p) => p.id)).toEqual(["p10", "p11", "pX"]);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    playerJoins(state, mkPlayer("pX"), () => "tNovo");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-6: playerJoins completing the queue into a new team", () => {
  it("CEN-6: compacts the queue into a new team at the end of the rotation, with no bib once B is already in use", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const withQueue = { ...state, queue: makePlayers(14).slice(10) };
    const next = playerJoins(withQueue, mkPlayer("pX"), () => "tNovo");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1", "tNovo"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual(["p10", "p11", "p12", "p13", "pX"]);
    expect(next.teams[2]?.color).toBeNull();
    expect(next.queue).toEqual([]);
  });

  it("hands out a bib to the new team when it falls within the first B teams", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const withQueue = { ...state, queue: makePlayers(14).slice(10) };
    const next = playerJoins(withQueue, mkPlayer("pX"), () => "tNovo");
    expect(next.teams[2]?.color).toBe("azul");
  });
});

describe("findDonorIndex", () => {
  it("never returns an on-field index (0 or 1)", () => {
    expect(findDonorIndex(4, 0)).toBe(2);
    expect(findDonorIndex(4, 1)).toBe(2);
  });

  it("returns null when only the two on-field teams exist", () => {
    expect(findDonorIndex(2, 0)).toBeNull();
  });

  it("returns null when the only off-field team is the affected one", () => {
    expect(findDonorIndex(3, 2)).toBeNull();
  });
});

describe("CEN-6: playerLeaves", () => {
  it("removes a player who is in the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p10");
    expect(next.queue.map((p) => p.id)).toEqual(["p11"]);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("with a queue: the first queued player fills the vacancy", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p10",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p11"]);
  });

  it("CEN-1: without a queue, the donor is the first team off the field, never the on-field opponent", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p0");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
      "p10",
    ]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8", "p9"]);
    expect(next.teams[1]?.color).toBe("vermelho");
    expect(next.queue.map((p) => p.id)).toEqual(["p11", "p12", "p13", "p14"]);
  });

  it("CEN-2: without a queue, the donor search wraps circularly when the affected team is last in rotation", () => {
    const state = formInitialState(makePlayers(20), { teamSize: 5, colors: ["verde", "vermelho", "azul", "amarelo"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeaves(state, "p15");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1", "t3"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p16",
      "p17",
      "p18",
      "p19",
      "p10",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p11", "p12", "p13", "p14"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    playerLeaves(state, "p0");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-4: playerLeavesWithReducedTeamSize", () => {
  it("shrinks teamSize by one and sends the last player of every other team to the queue", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = playerLeavesWithReducedTeamSize(state, "p0", () => "tNovo");
    expect(next.config.teamSize).toBe(4);
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(next.teams[0]?.players.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8"]);
    expect(next.queue.map((p) => p.id)).toEqual(["p9"]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    playerLeavesWithReducedTeamSize(state, "p0", () => "tNovo");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-14: decideJoin", () => {
  const ctx: CommandContext = { random: () => 0, nextId: () => "pNovo", timerRunning: false };

  it("produces PLAYER_JOINED with a freshly generated id and no new teams", () => {
    const state = {
      ...formInitialState(
        makePlayers(8),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideJoin(state, { type: "join", name: "  Novo  " }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_JOINED",
      player: { id: "pNovo", name: "Novo" },
      newTeamIds: [],
    });
  });
});

describe("CEN-6: decideJoin completing the queue", () => {
  it("CEN-6: records the new team id when the join compacts the queue, with no bib once B is already in use", () => {
    const ids = ["pNovo", "tNovo"];
    let index = 0;
    const nextId = (): string => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    };
    const state = {
      ...formInitialState(
        makePlayers(14),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decideJoin(state, { type: "join", name: "Novo" }, { random: () => 0, nextId, timerRunning: false });
    if (!("event" in result) || result.event.type !== "PLAYER_JOINED") {
      throw new Error("expected a PLAYER_JOINED event");
    }
    expect(result.event.newTeamIds).toEqual(["tNovo"]);
  });
});

function activeState(count: number, colors: string[] = ["verde", "vermelho", "azul"]): MatchState {
  const state = formInitialState(
    makePlayers(count),
    { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
  return { ...state, status: "ACTIVE" };
}

function ctx(timerRunning: boolean, nextId: () => string = () => "unused"): CommandContext {
  return { random: () => 0, nextId, timerRunning };
}

describe("CEN-15/CEN-16/CEN-17: decideLeave", () => {
  it("CEN-15: produces PLAYER_LEFT with fallback none and no new teams", () => {
    const state = activeState(15);
    const result = decideLeave(state, { type: "leave", playerId: "p0" }, ctx(false));
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "none",
      newTeamIds: [],
    });
  });

  it("CEN-16: rejects a non-existent player", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "fantasma" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_NOT_FOUND");
    }
  });

  it("CEN-17: rejects a player on an on-field team while the timer runs", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "p0" }, ctx(true));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("PLAYER_LOCKED");
    }
  });

  it("does not lock an off-field player who still has a donor available", () => {
    const state = activeState(20, ["verde", "vermelho", "azul", "amarelo"]);
    const result = decideLeave(state, { type: "leave", playerId: "p10" }, ctx(true));
    expect("event" in result).toBe(true);
  });
});

describe("CEN-3/CEN-5: decideLeave without a donor", () => {
  it("CEN-3: rejects with NO_DONOR_AVAILABLE when there are only the two on-field teams", () => {
    const state = activeState(10);
    try {
      decideLeave(state, { type: "leave", playerId: "p0" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NO_DONOR_AVAILABLE");
    }
  });

  it("CEN-5: rejects with NO_DONOR_AVAILABLE when the only off-field team is the affected one", () => {
    const state = activeState(15);
    try {
      decideLeave(state, { type: "leave", playerId: "p10" }, ctx(false));
      throw new Error("expected decideLeave to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("NO_DONOR_AVAILABLE");
    }
  });
});

describe("CEN-4: decideLeave with fallback reduce-team-size", () => {
  it("produces PLAYER_LEFT with fallback reduce-team-size and records any new team ids", () => {
    const state = activeState(10);
    let n = 0;
    const result = decideLeave(
      state,
      { type: "leave", playerId: "p0", fallback: "reduce-team-size" },
      ctx(false, () => `id${n++}`),
    );
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "PLAYER_LEFT",
      playerId: "p0",
      fallback: "reduce-team-size",
      newTeamIds: [],
    });
  });
});
