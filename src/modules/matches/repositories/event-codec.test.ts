import { describe, it, expect } from "vitest";
import { DEFAULT_SPLIT_CONFIG, applyEvent, type Event } from "../../../domain/match";
import { decodeEvent, encodeEventPayload } from "./event-codec";

const legacyPayload = {
  config: { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
  players: [{ id: "p1", name: "P1" }],
  teamIds: [],
};

describe("event codec", () => {
  it("E3: round-trips SPLIT_ENABLED", () => {
    const event = { type: "SPLIT_ENABLED", hourlyRateCents: 12000, durationMinutes: 90 } as const;
    expect(decodeEvent("SPLIT_ENABLED", encodeEventPayload(event))).toEqual(event);
    expect(() => decodeEvent("SPLIT_ENABLED", { hourlyRateCents: "x" })).toThrow();
  });

  it("E4: round-trips COLORS_ADDED", () => {
    const event: Event = { type: "COLORS_ADDED", colors: ["azul", "rosa"] };
    expect(decodeEvent("COLORS_ADDED", encodeEventPayload(event))).toEqual(event);
    expect(() => decodeEvent("COLORS_ADDED", { colors: "azul" })).toThrow();
  });

  it("F4 CEN-9: reads a legacy MATCH_CREATED without rule toggles as all rules off", () => {
    const event = decodeEvent("MATCH_CREATED", legacyPayload);
    const state = applyEvent(null, event);
    expect(state.config.ruleToggles).toEqual({ arrivalPriority: false, drawKeepsVeteran: false });
    expect(state.config.split).toEqual(DEFAULT_SPLIT_CONFIG);
  });

  it("F4 CEN-9: keeps the persisted rule toggles when present", () => {
    const event = decodeEvent("MATCH_CREATED", {
      ...legacyPayload,
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: true },
      },
    });
    expect(applyEvent(null, event).config.ruleToggles).toEqual({
      arrivalPriority: true,
      drawKeepsVeteran: false,
    });
  });

  it("F8 CEN-9: round-trips a persisted MATCH_SET_UP", () => {
    const event = decodeEvent("MATCH_SET_UP", {
      ...legacyPayload,
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: true, drawKeepsVeteran: false },
      },
    });
    expect(event).toEqual({
      type: "MATCH_SET_UP",
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: true, drawKeepsVeteran: false },
        split: DEFAULT_SPLIT_CONFIG,
      },
      players: legacyPayload.players,
      teamIds: [],
    });
  });

  it("E1: keeps an optional teamNames array untouched", () => {
    const event = decodeEvent("MATCH_CREATED", {
      ...legacyPayload,
      teamNames: ["Atacadão", null],
    });
    expect(event).toEqual({
      type: "MATCH_CREATED",
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
        split: DEFAULT_SPLIT_CONFIG,
      },
      players: legacyPayload.players,
      teamIds: [],
      teamNames: ["Atacadão", null],
    });
  });

  it("E1: decodes a legacy event without teamNames", () => {
    const event = decodeEvent("GAME_WON", {
      loserTeamId: "t0",
      decidedBy: "match",
      newTeamIds: [],
    });
    expect(event).toEqual({
      type: "GAME_WON",
      loserTeamId: "t0",
      decidedBy: "match",
      newTeamIds: [],
    });
    expect("teamNames" in event).toBe(false);
  });

  it("E1: rejects a malformed teamNames array", () => {
    expect(() =>
      decodeEvent("MATCH_CREATED", { ...legacyPayload, teamNames: ["Atacadão", 1] }),
    ).toThrow('invariant: invalid persisted event payload for "MATCH_CREATED"');
  });

  it("E1: round-trips teamNames through encode and decode", () => {
    const event = {
      type: "GAME_WON" as const,
      loserTeamId: "t0",
      decidedBy: "match" as const,
      newTeamIds: [],
      teamNames: [null, "Atacadão"],
    };
    expect(decodeEvent(event.type, encodeEventPayload(event))).toEqual(event);
  });
});

describe("event codec — E5", () => {
  it("keeps numeric arrival numbers and drops invalid ones", () => {
    const event = decodeEvent("MATCH_CREATED", {
      ...legacyPayload,
      players: [
        { id: "p1", name: "P1", arrival: 1 },
        { id: "p2", name: "P2", arrival: "2" },
      ],
    });
    expect(event.type === "MATCH_CREATED" && event.players).toEqual([
      { id: "p1", name: "P1", arrival: 1 },
      { id: "p2", name: "P2" },
    ]);
    const joined = decodeEvent("PLAYER_JOINED", {
      player: { id: "p3", name: "P3", arrival: 3 },
      newTeamIds: [],
    });
    expect(joined).toEqual({
      type: "PLAYER_JOINED",
      player: { id: "p3", name: "P3", arrival: 3 },
      newTeamIds: [],
    });
  });

  it("round-trips GAME_WON decided by the draw rule and RULES_CHANGED", () => {
    const won: Event = { type: "GAME_WON", loserTeamId: "t1", decidedBy: "draw", newTeamIds: [] };
    expect(decodeEvent("GAME_WON", encodeEventPayload(won))).toEqual(won);
    const changed: Event = {
      type: "RULES_CHANGED",
      ruleToggles: { arrivalPriority: false, drawKeepsVeteran: true },
    };
    expect(decodeEvent("RULES_CHANGED", encodeEventPayload(changed))).toEqual(changed);
    expect(() => decodeEvent("RULES_CHANGED", {})).toThrow(/RULES_CHANGED/);
  });
});
