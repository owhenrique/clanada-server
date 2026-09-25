import { describe, it, expect } from "vitest";
import { applyEvent } from "../../../domain/match";
import { decodeEvent } from "./event-codec";

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
  });

  it("F4 CEN-9: keeps the persisted rule toggles when present", () => {
    const event = decodeEvent("MATCH_CREATED", {
      ...legacyPayload,
      config: { ...legacyPayload.config, ruleToggles: { arrivalPriority: true } },
    });
    expect(applyEvent(null, event).config.ruleToggles).toEqual({ arrivalPriority: true });
  });

  it("F8 CEN-9: round-trips a persisted MATCH_SET_UP", () => {
    const event = decodeEvent("MATCH_SET_UP", {
      ...legacyPayload,
      config: { ...legacyPayload.config, ruleToggles: { arrivalPriority: true } },
    });
    expect(event).toEqual({
      type: "MATCH_SET_UP",
      config: { ...legacyPayload.config, ruleToggles: { arrivalPriority: true } },
      players: legacyPayload.players,
      teamIds: [],
    });
  });
});
