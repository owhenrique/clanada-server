export type RuleToggles = {
  arrivalPriority: boolean;
};

export const DEFAULT_RULE_TOGGLES: RuleToggles = {
  arrivalPriority: true,
};

export const LEGACY_RULE_TOGGLES: RuleToggles = {
  arrivalPriority: false,
};

const RULE_KEYS = Object.keys(DEFAULT_RULE_TOGGLES) as (keyof RuleToggles)[];

export function resolveRuleToggles(partial: Partial<RuleToggles> | undefined): RuleToggles {
  return { ...DEFAULT_RULE_TOGGLES, ...partial };
}

export function decodeRuleToggles(value: unknown): RuleToggles {
  if (typeof value !== "object" || value === null) {
    return LEGACY_RULE_TOGGLES;
  }
  const stored = value as Record<string, unknown>;
  const partial: Partial<RuleToggles> = {};
  for (const key of RULE_KEYS) {
    const flag = stored[key];
    if (typeof flag === "boolean") {
      partial[key] = flag;
    }
  }
  return resolveRuleToggles(partial);
}
