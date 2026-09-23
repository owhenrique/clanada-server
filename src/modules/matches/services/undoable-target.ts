import { UNDOABLE_EVENTS } from "../../../domain/match";
import type { StoredEvent } from "../repositories/matches.repository";

export function findUndoableTarget(activeEvents: readonly StoredEvent[]): number {
  const startedIndex = activeEvents.findIndex((stored) => stored.event.type === "MATCH_STARTED");
  for (let index = activeEvents.length - 1; index > startedIndex; index--) {
    const stored = activeEvents[index];
    if (stored !== undefined && UNDOABLE_EVENTS.has(stored.event.type)) {
      return index;
    }
  }
  return -1;
}
