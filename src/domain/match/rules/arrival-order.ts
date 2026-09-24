import { shuffle } from "./shuffle";
import type { Player } from "../types";
import type { RuleToggles } from "../rule-toggles";

export function orderPlayers(
  players: Player[],
  seatedCount: number,
  toggles: RuleToggles,
  rng: () => number,
): Player[] {
  if (!toggles.arrivalPriority) {
    return shuffle(players, rng);
  }
  return [...shuffle(players.slice(0, seatedCount), rng), ...players.slice(seatedCount)];
}
