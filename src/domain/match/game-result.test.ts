import { describe, it, expect } from "vitest";
import { mkPlayer, makePlayers, teamId, idGen } from "./test-fixtures";
import {
  applyGameResult,
  resolveDraw,
  decideWin,
  decideDraw,
  decidePenalties,
} from "./game-result";
import { formInitialState } from "./lineup";
import type { Player, MatchState, Team, CommandContext } from "./model";
import { DomainError } from "../../shared/errors/domain-error";

function colorOf(state: MatchState, id: string): string | null | undefined {
  return state.teams.find((team) => team.id === id)?.color;
}

function streakOf(state: MatchState, id: string): number | undefined {
  return state.teams.find((team) => team.id === id)?.gameStreak;
}

describe("CEN-3: applyGameResult — fechadas", () => {
  it("winner stays, next enters, loser goes to the tail", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t2", "t1"]);
    expect(next.queue).toEqual([]);
  });

  it("fechadas with bibs >= teams: each team keeps its fixed color", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(colorOf(next, "t0")).toBe("verde");
    expect(colorOf(next, "t1")).toBe("vermelho");
    expect(colorOf(next, "t2")).toBe("azul");
  });

  it("increments the winner's streak and resets the loser's", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(streakOf(next, "t0")).toBe(1);
    expect(streakOf(next, "t1")).toBe(0);
    expect(streakOf(next, "t2")).toBe(0);
  });

  it("fewer bibs than teams: the leaving team hands its bib to the next", () => {
    const state = formInitialState(makePlayers(20), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t0", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t0"]);
    expect(next.teams.map((t) => t.color)).toEqual([
      "vermelho",
      "azul",
      "verde",
      null,
    ]);
  });

  it("only two teams and no queue: they replay", () => {
    const state = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(streakOf(next, "t0")).toBe(1);
    expect(next.queue).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(makePlayers(15), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const snapshot = JSON.stringify(state);
    applyGameResult(state, "t1", () => "new");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-2: applyGameResult — abertas", () => {
  it("loser dissolves into the queue and a new team is formed immediately", () => {
    const state = formInitialState(makePlayers(17), { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t2", "new"]);
    expect(next.teams[2]?.players.map((p) => p.id)).toEqual([
      "p15",
      "p16",
      "p5",
      "p6",
      "p7",
    ]);
    expect(next.queue.map((p) => p.id)).toEqual(["p8", "p9"]);
  });

  it("without waiting teams: forms the next team from the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const next = applyGameResult(state, "t1", () => "new");
    expect(next.teams).toHaveLength(2);
    expect(next.teams[0]?.id).toBe("t0");
    expect(next.teams[1]?.id).toBe("new");
    expect(next.teams[1]?.players.map((p) => p.id)).toEqual([
      "p10",
      "p11",
      "p5",
      "p6",
      "p7",
    ]);
    expect(next.teams[1]?.color).toBe("vermelho");
    expect(next.queue.map((p) => p.id)).toEqual(["p8", "p9"]);
  });

  it("prefers a never-used bib over recycling the one the losing team just wore", () => {
    const base = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho", "azul", "amarelo"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: [...base.queue, mkPlayer("j0"), mkPlayer("j1"), mkPlayer("j2")] };
    expect(state.queue).toHaveLength(5);

    const next = applyGameResult(state, "t0", idGen());

    expect(next.teams.map((t) => t.color)).toEqual([
      "vermelho",
      "azul",
      "amarelo",
    ]);
  });

  it("recycles the just-freed bib only once every never-used color is taken", () => {
    const base = formInitialState(makePlayers(10), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } }, teamId);
    const state = { ...base, queue: [...base.queue, mkPlayer("j0"), mkPlayer("j1"), mkPlayer("j2")] };
    expect(state.queue).toHaveLength(3);

    const next = applyGameResult(state, "t0", idGen());

    expect(next.teams.map((t) => t.color)).toEqual(["vermelho", "verde"]);
  });
});

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

describe("CEN-9/CEN-10: decideWin", () => {
  const ctx = (nextId: () => string): CommandContext => ({
    random: () => 0,
    nextId,
    timerRunning: false,
  });

  function activeState(count: number, colors: string[]): MatchState {
    const state = formInitialState(
      makePlayers(count),
      { teamSize: 5, colors, gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      (i) => `t${i}`,
    );
    return { ...state, status: "ACTIVE" };
  }

  it("CEN-9: with a queue, records the ids of the newly formed team", () => {
    const state = activeState(12, ["verde", "vermelho", "azul"]);
    const result = decideWin(
      state,
      { type: "win", loserTeamId: "t1" },
      ctx(idGen()),
    );
    if (!("event" in result) || result.event.type !== "GAME_WON") {
      throw new Error("expected a GAME_WON event");
    }
    expect(result.event.decidedBy).toBe("match");
    expect(result.event.newTeamIds).toEqual(["n0"]);
  });

  it("without a queue, records no new team ids", () => {
    const state = activeState(10, ["verde", "vermelho"]);
    const result = decideWin(
      state,
      { type: "win", loserTeamId: "t1" },
      ctx(idGen()),
    );
    if (!("event" in result) || result.event.type !== "GAME_WON") {
      throw new Error("expected a GAME_WON event");
    }
    expect(result.event.newTeamIds).toEqual([]);
  });

  it("CEN-10: rejects a loserTeamId that is not on the field", () => {
    const state = activeState(15, ["verde", "vermelho", "azul"]);
    try {
      decideWin(state, { type: "win", loserTeamId: "t2" }, ctx(idGen()));
      throw new Error("expected decideWin to throw");
    } catch (error) {
      expect((error as DomainError).code).toBe("TEAM_NOT_ON_FIELD");
    }
  });
});

function fullTeam(id: string): Team {
  return {
    id,
    color: null,
    gameStreak: 0,
    players: Array.from({ length: 5 }, (_, i) => mkPlayer(`${id}-${i}`)),
  };
}

describe("CEN-11/CEN-12: decideDraw", () => {
  function mkState(teams: Team[]): MatchState {
    return {
      status: "ACTIVE",
      config: { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
      teams,
      queue: [],
    };
  }

  function ctx(random: () => number): CommandContext {
    return { random, nextId: idGen(), timerRunning: false };
  }

  it("CEN-11: fewer than two complete waiting teams asks for penalties, without an event", () => {
    const state = mkState([fullTeam("t0"), fullTeam("t1"), fullTeam("t2")]);
    const result = decideDraw(state, { type: "draw" }, ctx(() => 0));
    expect(result).toEqual({ penaltiesRequired: true });
  });

  it("CEN-12: with a swap, records who leaves first and the new team ids", () => {
    const state = mkState([
      fullTeam("t0"),
      fullTeam("t1"),
      fullTeam("t2"),
      fullTeam("t3"),
    ]);
    const low = decideDraw(state, { type: "draw" }, ctx(() => 0));
    if (!("event" in low) || low.event.type !== "GAME_DRAWN") {
      throw new Error("expected a GAME_DRAWN event");
    }
    expect(low.event.firstLeaverTeamId).toBe("t0");

    const high = decideDraw(state, { type: "draw" }, ctx(() => 0.9));
    if (!("event" in high) || high.event.type !== "GAME_DRAWN") {
      throw new Error("expected a GAME_DRAWN event");
    }
    expect(high.event.firstLeaverTeamId).toBe("t1");
    expect(high.event.newTeamIds).toEqual(["n0", "n1"]);
  });
});

const ctx: CommandContext = { random: () => 0, nextId: () => "n0", timerRunning: false };

describe("CEN-13: decidePenalties", () => {
  it("produces GAME_WON with decidedBy penalties", () => {
    const state = {
      ...formInitialState(
        makePlayers(10),
        { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
        (i) => `t${i}`,
      ),
      status: "ACTIVE" as const,
    };
    const result = decidePenalties(state, { type: "penalties", loserTeamId: "t1" }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event).toEqual({
      type: "GAME_WON",
      loserTeamId: "t1",
      decidedBy: "penalties",
      newTeamIds: [],
    });
  });
});
