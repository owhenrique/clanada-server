import { shuffle } from "./shuffle";
import type { Player } from "../types";
import type { RuleToggles } from "../rule-toggles";

export function orderPlayers(
  players: Player[],
  seatedCount: number,
  teamSize: number,
  toggles: RuleToggles,
  rng: () => number,
): Player[] {
  if (!toggles.arrivalPriority) {
    return shuffle(players, rng);
  }
  const fieldCount = Math.min(seatedCount, 2 * teamSize);
  return [...shuffle(players.slice(0, fieldCount), rng), ...players.slice(fieldCount)];
}
