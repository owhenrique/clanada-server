import { describe, it, expect } from "vitest";
import { DEFAULT_SPLIT_CONFIG, applyEvent } from "../../../domain/match";
import { decodeEvent, encodeEventPayload } from "./event-codec";

const legacyPayload = {
  config: { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
  players: [{ id: "p1", name: "P1" }],
  teamIds: [],
};

describe("event codec", () => {
  it("F4 CEN-9: reads a legacy MATCH_CREATED without rule toggles as all rules off", () => {
    const event = decodeEvent("MATCH_CREATED", legacyPayload);
    const state = applyEvent(null, event);
    expect(state.config.ruleToggles).toEqual({ arrivalPriority: false });
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
    });
  });

  it("F8 CEN-9: round-trips a persisted MATCH_SET_UP", () => {
    const event = decodeEvent("MATCH_SET_UP", {
      ...legacyPayload,
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: true },
      },
    });
    expect(event).toEqual({
      type: "MATCH_SET_UP",
      config: {
        ...legacyPayload.config,
        ruleToggles: { arrivalPriority: true },
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
        ruleToggles: { arrivalPriority: false },
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
