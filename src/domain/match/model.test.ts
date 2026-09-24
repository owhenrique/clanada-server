import { describe, it, expect } from "vitest";
import {
  UNDOABLE_EVENTS,
  DEFAULT_RULE_TOGGLES,
  LEGACY_RULE_TOGGLES,
  decodeRuleToggles,
  resolveRuleToggles,
} from "./model";

describe("CEN-20: UNDOABLE_EVENTS", () => {
  it("contains only the events regra 12 lists as undoable", () => {
    expect([...UNDOABLE_EVENTS].sort()).toEqual(
      [
        "GAME_DRAWN",
        "GAME_WON",
        "PLAYERS_SWAPPED",
        "PLAYER_JOINED",
        "PLAYER_LEFT",
        "TEAM_SIZE_CHANGED",
      ].sort(),
    );
  });

  it("does not undo past the lifecycle events", () => {
    expect(UNDOABLE_EVENTS.has("MATCH_CREATED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("RESHUFFLED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("MATCH_STARTED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("MATCH_ENDED")).toBe(false);
  });
});

describe("rule toggles", () => {
  it("F4 CEN-10: resolves a missing or partial input over the defaults", () => {
    expect(DEFAULT_RULE_TOGGLES).toEqual({ arrivalPriority: true });
    expect(resolveRuleToggles(undefined)).toEqual({ arrivalPriority: true });
    expect(resolveRuleToggles({})).toEqual({ arrivalPriority: true });
    expect(resolveRuleToggles({ arrivalPriority: false })).toEqual({ arrivalPriority: false });
  });

  it("F4 CEN-9: decodes persisted configs without toggles as all rules off", () => {
    expect(LEGACY_RULE_TOGGLES).toEqual({ arrivalPriority: false });
    expect(decodeRuleToggles(undefined)).toEqual({ arrivalPriority: false });
    expect(decodeRuleToggles({ arrivalPriority: true })).toEqual({ arrivalPriority: true });
    expect(decodeRuleToggles({})).toEqual({ arrivalPriority: true });
  });
});
