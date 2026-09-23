import type { MatchState } from "./types";
import type { Event } from "./events";
import { applyEvent } from "./apply-event";

export function replay(events: readonly Event[]): MatchState {
  const [first, ...rest] = events;
  if (first === undefined || first.type !== "MATCH_CREATED") {
    throw new Error("invariant: replay requires MATCH_CREATED as the first event");
  }
  return rest.reduce<MatchState>(
    (state, event) => applyEvent(state, event),
    applyEvent(null, first),
  );
}
