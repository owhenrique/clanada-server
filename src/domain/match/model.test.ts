import { describe, it, expect } from "vitest";
import {
  UNDOABLE_EVENTS,
  DEFAULT_RULE_TOGGLES,
  LEGACY_RULE_TOGGLES,
  DEFAULT_SPLIT_CONFIG,
  decodeRuleToggles,
  decodeSplitConfig,
  resolveRuleToggles,
  resolveSplitConfig,
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
    expect(resolveRuleToggles({ arrivalPriority: false })).toEqual({
      arrivalPriority: false,
    });
  });

  it("F4 CEN-9: decodes persisted configs without toggles as all rules off", () => {
    expect(LEGACY_RULE_TOGGLES).toEqual({ arrivalPriority: false });
    expect(decodeRuleToggles(undefined)).toEqual({ arrivalPriority: false });
    expect(decodeRuleToggles({ arrivalPriority: true })).toEqual({
      arrivalPriority: true,
    });
    expect(decodeRuleToggles({})).toEqual({ arrivalPriority: true });
  });
});

describe("split config", () => {
  it("defaults to a disabled split of 2h at R$ 100,00/h", () => {
    expect(DEFAULT_SPLIT_CONFIG).toEqual({
      enabled: false,
      hourlyRateCents: 10000,
      durationMinutes: 120,
    });
    expect(resolveSplitConfig(undefined)).toEqual(DEFAULT_SPLIT_CONFIG);
    expect(resolveSplitConfig({})).toEqual(DEFAULT_SPLIT_CONFIG);
    expect(resolveSplitConfig({ enabled: true, durationMinutes: 90 })).toEqual({
      enabled: true,
      hourlyRateCents: 10000,
      durationMinutes: 90,
    });
  });

  it("decodes a missing or corrupt persisted value as disabled", () => {
    expect(decodeSplitConfig(undefined)).toEqual(DEFAULT_SPLIT_CONFIG);
    expect(decodeSplitConfig(null)).toEqual(DEFAULT_SPLIT_CONFIG);
    expect(decodeSplitConfig("2h")).toEqual(DEFAULT_SPLIT_CONFIG);
  });

  it("decodes a valid persisted split", () => {
    expect(
      decodeSplitConfig({
        enabled: true,
        hourlyRateCents: 8000,
        durationMinutes: 45,
      }),
    ).toEqual({ enabled: true, hourlyRateCents: 8000, durationMinutes: 45 });
  });

  it("falls back to the defaults field by field when a value is out of range", () => {
    expect(
      decodeSplitConfig({
        enabled: true,
        hourlyRateCents: 0,
        durationMinutes: 47,
      }),
    ).toEqual({ enabled: true, hourlyRateCents: 10000, durationMinutes: 120 });
    expect(
      decodeSplitConfig({
        enabled: true,
        hourlyRateCents: 100001,
        durationMinutes: 240,
      }),
    ).toEqual({ enabled: true, hourlyRateCents: 10000, durationMinutes: 240 });
    expect(
      decodeSplitConfig({
        enabled: true,
        hourlyRateCents: 12.5,
        durationMinutes: 15,
      }),
    ).toEqual({ enabled: true, hourlyRateCents: 10000, durationMinutes: 120 });
  });
});
