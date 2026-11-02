import { describe, it, expect } from "vitest";
import { makePlayers, teamId } from "./test-fixtures";
import { formInitialState, decideCreate } from "./lineup";
import { decideJoin } from "./roster";
import { applyEvent } from "./engine";
import { effectiveArrivals, nextArrival, drawStayerId } from "./arrival";
import { onFieldTeams } from "./game-result";
import type { CommandContext, MatchState, Player } from "./model";
import { DEFAULT_SPLIT_CONFIG } from "./model";

const config = {
  teamSize: 2,
  colors: ["verde", "vermelho"],
  gameMinutes: 10,
  ruleToggles: { arrivalPriority: true, drawKeepsVeteran: true },
  split: DEFAULT_SPLIT_CONFIG,
};

function ctx(random: () => number = () => 0.99): CommandContext {
  let n = 0;
  return { random, nextId: () => `id${n++}`, timerRunning: false };
}

function stateOf(players: Player[]): MatchState {
  return formInitialState(players, config, teamId);
}

describe("E5 CA-1: arrival numbers", () => {
  it("keeps the list position as arrival number even after the shuffle", () => {
    const result = decideCreate(
      null,
      { type: "create", playerNames: ["Ana", "Bia", "Caio", "Duda", "Eli"], config },
      ctx(() => 0),
    );
    if (!("event" in result) || result.event.type !== "MATCH_CREATED") {
      throw new Error("expected MATCH_CREATED");
    }
    const byName = new Map(result.event.players.map((p) => [p.name, p.arrival]));
    expect(byName).toEqual(
      new Map([["Ana", 1], ["Bia", 2], ["Caio", 3], ["Duda", 4], ["Eli", 5]]),
    );
    expect(result.event.players.map((p) => p.name)).not.toEqual(["Ana", "Bia", "Caio", "Duda", "Eli"]);
  });

  it("gives the joining player the next number", () => {
    const created = decideCreate(
      null,
      { type: "create", playerNames: ["Ana", "Bia", "Caio", "Duda", "Eli"], config },
      ctx(),
    );
    if (!("event" in created)) {
      throw new Error("expected event");
    }
    const state = { ...applyEvent(null, created.event), status: "ACTIVE" as const };
    const joined = decideJoin(state, { type: "join", name: "Fê" }, ctx());
    if (!("event" in joined) || joined.event.type !== "PLAYER_JOINED") {
      throw new Error("expected PLAYER_JOINED");
    }
    expect(joined.event.player.arrival).toBe(6);
    expect(nextArrival(applyEvent(state, joined.event))).toBe(7);
  });
});

describe("E5 CA-9: legacy players without arrival", () => {
  it("uses the current order (rotation, then queue) as approximation", () => {
    const state = stateOf(makePlayers(5));
    expect([...effectiveArrivals(state).values()]).toEqual([1, 2, 3, 4, 5]);
    expect(nextArrival(state)).toBe(6);
  });
});

describe("E5 CA-3/CA-4: drawStayerId", () => {
  const players: Player[] = [
    { id: "a", name: "A", arrival: 3 },
    { id: "b", name: "B", arrival: 4 },
    { id: "c", name: "C", arrival: 1 },
    { id: "d", name: "D", arrival: 2 },
  ];

  it("without veteran keeps the team of the earliest arrival", () => {
    const state = stateOf(players);
    expect(drawStayerId(state, onFieldTeams(state))).toBe("t1");
  });

  it("keeps the veteran even when the newcomer has the earliest arrival", () => {
    const state = { ...stateOf(players), veteranTeamId: "t0" };
    expect(drawStayerId(state, onFieldTeams(state))).toBe("t0");
  });

  it("ignores a veteran id that is no longer on the field", () => {
    const state = { ...stateOf(players), veteranTeamId: "gone" };
    expect(drawStayerId(state, onFieldTeams(state))).toBe("t1");
  });

  it("on a tie keeps the first team of the rotation", () => {
    const state = stateOf(makePlayers(4));
    const tied = {
      ...state,
      teams: state.teams.map((team) => ({
        ...team,
        players: team.players.map((p) => ({ ...p, arrival: 1 })),
      })),
    };
    expect(drawStayerId(tied, onFieldTeams(tied))).toBe("t0");
  });
});
