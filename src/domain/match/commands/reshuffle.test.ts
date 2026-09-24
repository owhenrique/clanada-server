import { describe, it, expect } from "vitest";
import { decideReshuffle } from "./reshuffle";
import { formInitialState } from "../rules/formation";
import { swapPlayers } from "../rules/swap";
import { shuffle } from "../rules/shuffle";
import { flattenPlayers } from "../rules/flatten";
import { applyEvent } from "../apply-event";
import type { MatchState, Player } from "../types";
import type { CommandContext } from "./types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

function draftState(): MatchState {
  return formInitialState(
    makePlayers(12),
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority: false } },
    (i) => `t${i}`,
  );
}

function ctxWithIds(teamIds: string[]): CommandContext {
  let index = 0;
  return {
    random: () => 0.9,
    nextId: () => {
      const id = teamIds[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

describe("CEN-4: decideReshuffle", () => {
  it("reorders the players and records fresh team ids", () => {
    const state = draftState();
    const result = decideReshuffle(state, { type: "reshuffle" }, ctxWithIds(["t2", "t3"]));
    if (!("event" in result) || result.event.type !== "RESHUFFLED") {
      throw new Error("expected a RESHUFFLED event");
    }
    expect(result.event.teamIds).toEqual(["t2", "t3"]);
    expect(result.event.order).toHaveLength(12);
    expect(new Set(result.event.order)).toEqual(
      new Set(makePlayers(12).map((p) => p.id)),
    );
  });
});

function arrivalDraft(arrivalPriority: boolean): MatchState {
  const players = Array.from({ length: 11 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
  }));
  return formInitialState(
    players,
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority } },
    (i) => `t${i}`,
  );
}

function reshuffled(state: MatchState, random: () => number): MatchState {
  const ctx: CommandContext = { ...ctxWithIds(["t2", "t3"]), random };
  const result = decideReshuffle(state, { type: "reshuffle" }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return applyEvent(state, result.event);
}

function teamIds(state: MatchState): string[] {
  return state.teams.flatMap((team) => team.players.map((player) => player.id));
}

const firstTen = Array.from({ length: 10 }, (_, index) => `p${index + 1}`);

describe("arrival priority on reshuffle", () => {
  it("F4 CEN-6: keeps the queue and reshuffles only the players on the teams", () => {
    const state = reshuffled(arrivalDraft(true), () => 0);
    expect(state.queue.map((player) => player.id)).toEqual(["p11"]);
    expect(new Set(teamIds(state))).toEqual(new Set(firstTen));
    const firstTeam = new Set(state.teams[0]?.players.map((player) => player.id));
    expect(firstTeam).not.toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });

  it("F4 CEN-7: respects a manual swap between a team and the queue", () => {
    const swapped = swapPlayers(arrivalDraft(true), "p11", "p10");
    const state = reshuffled(swapped, () => 0);
    expect(teamIds(state)).toContain("p11");
    expect(state.queue.map((player) => player.id)).toEqual(["p10"]);
  });

  it("F4 CEN-8: shuffles everyone when the rule is off", () => {
    const draft = arrivalDraft(false);
    const random = (): number => 0;
    const state = reshuffled(draft, random);
    const expected = shuffle(flattenPlayers(draft), random).map((player) => player.id);
    expect([...teamIds(state), ...state.queue.map((player) => player.id)]).toEqual(expected);
    expect(state.queue.map((player) => player.id)).not.toEqual(["p11"]);
  });
});

function threeTeamDraft(arrivalPriority: boolean): MatchState {
  const players = Array.from({ length: 16 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `P${index + 1}`,
  }));
  return formInitialState(
    players,
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10, ruleToggles: { arrivalPriority } },
    (i) => `t${i}`,
  );
}

function reshuffledThree(state: MatchState, random: () => number): MatchState {
  const ctx: CommandContext = { ...ctxWithIds(["t3", "t4", "t5"]), random };
  const result = decideReshuffle(state, { type: "reshuffle" }, ctx);
  if (!("event" in result)) {
    throw new Error("expected an event");
  }
  return applyEvent(state, result.event);
}

function playerIdsAt(state: MatchState, index: number): string[] {
  return state.teams[index]?.players.map((player) => player.id) ?? [];
}

describe("arrival priority reshuffles only the teams on the field", () => {
  it("F6 CEN-4: keeps the third team and the queue untouched", () => {
    const state = reshuffledThree(threeTeamDraft(true), () => 0);
    expect(new Set([...playerIdsAt(state, 0), ...playerIdsAt(state, 1)])).toEqual(new Set(firstTen));
    expect(new Set(playerIdsAt(state, 0))).not.toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
    expect(playerIdsAt(state, 2)).toEqual(["p11", "p12", "p13", "p14", "p15"]);
    expect(state.queue.map((player) => player.id)).toEqual(["p16"]);
  });

  it("F6 CEN-5: shuffles everyone when the rule is off", () => {
    const draft = threeTeamDraft(false);
    const random = (): number => 0;
    const state = reshuffledThree(draft, random);
    const expected = shuffle(flattenPlayers(draft), random).map((player) => player.id);
    expect([...teamIds(state), ...state.queue.map((player) => player.id)]).toEqual(expected);
  });
});
