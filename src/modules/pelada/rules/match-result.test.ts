import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { applyResult } from "./match-result";
import { playerJoins } from "./join";
import type { Player, PeladaState } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function mkPlayer(id: string): Player {
  return { id, name: id };
}

const teamId = (index: number): string => `t${index}`;

function idGen(): () => string {
  let n = 0;
  return () => `n${n++}`;
}

function colorOf(state: PeladaState, id: string): string | null | undefined {
  return state.teams.find((team) => team.id === id)?.color;
}

function streakOf(state: PeladaState, id: string): number | undefined {
  return state.teams.find((team) => team.id === id)?.matchStreak;
}

describe("CEN-3: applyResult — fechadas", () => {
  it("winner stays, next enters, loser goes to the tail", () => {
    const state = formInitialState(
      makePlayers(15),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t2", "t1"]);
    expect(next.queue).toEqual([]);
  });

  it("fechadas with bibs >= teams: each team keeps its fixed color", () => {
    const state = formInitialState(
      makePlayers(15),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
    expect(colorOf(next, "t0")).toBe("verde");
    expect(colorOf(next, "t1")).toBe("vermelho");
    expect(colorOf(next, "t2")).toBe("azul");
  });

  it("increments the winner's streak and resets the loser's", () => {
    const state = formInitialState(
      makePlayers(15),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
    expect(streakOf(next, "t0")).toBe(1);
    expect(streakOf(next, "t1")).toBe(0);
    expect(streakOf(next, "t2")).toBe(0);
  });

  it("fewer bibs than teams: the leaving team hands its bib to the next", () => {
    const state = formInitialState(
      makePlayers(20),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const next = applyResult(state, "t0", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t0"]);
    expect(next.teams.map((t) => t.color)).toEqual([
      "vermelho",
      "azul",
      "verde",
      null,
    ]);
  });

  it("only two teams and no queue: they replay", () => {
    const state = formInitialState(
      makePlayers(10),
      5,
      ["verde", "vermelho"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
    expect(next.teams.map((t) => t.id)).toEqual(["t0", "t1"]);
    expect(streakOf(next, "t0")).toBe(1);
    expect(next.queue).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = formInitialState(
      makePlayers(15),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const snapshot = JSON.stringify(state);
    applyResult(state, "t1", () => "new");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("CEN-2: applyResult — abertas", () => {
  it("loser dissolves into the queue and a new team is formed immediately", () => {
    const state = formInitialState(
      makePlayers(17),
      5,
      ["verde", "vermelho", "azul"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
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
    const state = formInitialState(
      makePlayers(12),
      5,
      ["verde", "vermelho"],
      teamId,
    );
    const next = applyResult(state, "t1", () => "new");
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
    let state = formInitialState(
      makePlayers(12),
      5,
      ["verde", "vermelho", "azul", "amarelo"],
      teamId,
    );
    for (const p of [mkPlayer("j0"), mkPlayer("j1"), mkPlayer("j2")]) {
      state = playerJoins(state, p);
    }
    expect(state.queue).toHaveLength(5);

    const next = applyResult(state, "t0", idGen());

    expect(next.teams.map((t) => t.color)).toEqual([
      "vermelho",
      "azul",
      "amarelo",
    ]);
  });

  it("recycles the just-freed bib only once every never-used color is taken", () => {
    let state = formInitialState(
      makePlayers(10),
      5,
      ["verde", "vermelho"],
      teamId,
    );
    for (const p of [mkPlayer("j0"), mkPlayer("j1"), mkPlayer("j2")]) {
      state = playerJoins(state, p);
    }
    expect(state.queue).toHaveLength(3);

    const next = applyResult(state, "t0", idGen());

    expect(next.teams.map((t) => t.color)).toEqual(["vermelho", "verde"]);
  });
});
