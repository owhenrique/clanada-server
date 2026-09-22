import type { MatchState } from "./types";

export function requireState(state: MatchState | null): MatchState {
  if (state === null) {
    throw new Error("invariant: expected an existing match state");
  }
  return state;
}
