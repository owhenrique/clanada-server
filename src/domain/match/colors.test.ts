import { describe, expect, it } from "vitest";
import { applyEvent, decide, replay } from "./engine";
import { assertValidState } from "./invariants";
import type { Event, MatchConfig, MatchState } from "./model";
import { DEFAULT_RULE_TOGGLES, DEFAULT_SPLIT_CONFIG, UNDOABLE_EVENTS } from "./model";
import { idGen, makePlayers } from "./test-fixtures";

const ctx = { random: () => 0.5, nextId: idGen(), timerRunning: false };

function config(colors: string[]): MatchConfig {
  return {
    teamSize: 1,
    colors,
    gameMinutes: 10,
    ruleToggles: DEFAULT_RULE_TOGGLES,
    split: DEFAULT_SPLIT_CONFIG,
  };
}

function started(teamCount: number, colors: string[]): { events: Event[]; state: MatchState } {
  const events: Event[] = [
    {
      type: "MATCH_CREATED",
      config: config(colors),
      players: makePlayers(teamCount),
      teamIds: Array.from({ length: teamCount }, (_, i) => `t${i}`),
    },
    { type: "MATCH_STARTED" },
  ];
  return { events, state: replay(events) };
}

function add(state: MatchState, colors: string[]): Event {
  const result = decide(state, { type: "addColors", colors }, ctx);
  if (!("event" in result)) throw new Error("expected event");
  return result.event;
}

describe("addColors", () => {
  it("gives the new color to the closest team without a vest", () => {
    const { state } = started(4, ["verde", "vermelho"]);
    const next = applyEvent(state, add(state, ["azul"]));
    expect(next.teams.map((team) => team.color)).toEqual(["verde", "vermelho", "azul", null]);
    expect(next.config.colors).toEqual(["verde", "vermelho", "azul"]);
    assertValidState(next);
  });

  it("keeps the colors of teams that already have a vest", () => {
    const { state } = started(4, ["verde", "vermelho", "azul"]);
    const next = applyEvent(state, add(state, ["amarelo"]));
    expect(next.teams.map((team) => team.color)).toEqual(["verde", "vermelho", "azul", "amarelo"]);
  });

  it("changes no team when all of them already have a vest", () => {
    const { state } = started(2, ["verde", "vermelho"]);
    const next = applyEvent(state, add(state, ["azul"]));
    expect(next.teams.map((team) => team.color)).toEqual(["verde", "vermelho"]);
    expect(next.config.colors).toContain("azul");
  });

  it("distributes several colors in the order given", () => {
    const { state } = started(5, ["verde", "vermelho"]);
    const next = applyEvent(state, add(state, ["azul", "amarelo"]));
    expect(next.teams.map((team) => team.color)).toEqual([
      "verde",
      "vermelho",
      "azul",
      "amarelo",
      null,
    ]);
    assertValidState(next);
  });

  it("rejects empty, repeated and already present colors", () => {
    const { state } = started(3, ["verde", "vermelho"]);
    for (const colors of [[], ["azul", "azul"], ["verde"]]) {
      expect(() => decide(state, { type: "addColors", colors }, ctx)).toThrow("COLORS_INVALID");
    }
  });

  it("is only allowed while the match is active", () => {
    const draft = replay([started(3, ["verde", "vermelho"]).events[0] as Event]);
    expect(() => decide(draft, { type: "addColors", colors: ["azul"] }, ctx)).toThrow(
      "INVALID_STATUS",
    );
  });

  it("is undoable and replays without the event", () => {
    const { events, state } = started(4, ["verde", "vermelho"]);
    expect(UNDOABLE_EVENTS.has("COLORS_ADDED")).toBe(true);
    const withColor = replay([...events, add(state, ["azul"])]);
    expect(withColor.teams[2]?.color).toBe("azul");
    expect(replay(events).teams[2]?.color).toBeNull();
  });

  it("makes the color available to teams formed later", () => {
    const { state } = started(2, ["verde", "vermelho"]);
    const withColor = applyEvent(state, add(state, ["azul"]));
    const joined = decide(withColor, { type: "join", name: "Novo" }, ctx);
    if (!("event" in joined)) throw new Error("expected event");
    const next = applyEvent(withColor, joined.event);
    expect(next.teams.map((team) => team.color)).toEqual(["verde", "vermelho", "azul"]);
    assertValidState(next);
  });
});
