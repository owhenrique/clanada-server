import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULE_TOGGLES,
  LEGACY_RULE_TOGGLES,
  decodeRuleToggles,
  resolveRuleToggles,
} from "./rule-toggles";

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
