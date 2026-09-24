import type { MatchState } from "./model";

export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`invariant: index ${index} out of bounds`);
  }
  return value;
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    const swapped = result[j];
    if (temp === undefined || swapped === undefined) {
      throw new Error("invariant: shuffle index out of bounds");
    }
    result[i] = swapped;
    result[j] = temp;
  }
  return result;
}

export function requireState(state: MatchState | null): MatchState {
  if (state === null) {
    throw new Error("invariant: expected an existing match state");
  }
  return state;
}

export function idsFrom(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) {
      throw new Error("invariant: ran out of recorded ids during replay");
    }
    index++;
    return id;
  };
}

export function recordingIdFactory(nextId: () => string): {
  createId: () => string;
  ids: string[];
} {
  const ids: string[] = [];
  return {
    createId: () => {
      const id = nextId();
      ids.push(id);
      return id;
    },
    ids,
  };
}
