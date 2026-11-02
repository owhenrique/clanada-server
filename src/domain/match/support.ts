import type { MatchState, Team } from "./model";
import { firstFreeName, pickFreeName, usedTeamNames } from "./team-names";

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

function previousTeamNames(previous: MatchState | null): Map<string, string | null> {
  return new Map((previous?.teams ?? []).map((team) => [team.id, team.name]));
}

function survivingTeamNames(previous: MatchState | null, next: MatchState): Set<string> {
  const surviving = new Set(next.teams.map((team) => team.id));
  return usedTeamNames((previous?.teams ?? []).filter((team) => surviving.has(team.id)));
}

export function assignTeamNames(
  previous: MatchState | null,
  next: MatchState,
  recorded?: readonly (string | null)[],
): MatchState {
  const known = previousTeamNames(previous);
  const added = next.teams.filter((team) => !known.has(team.id));
  if (added.length === 0) {
    return next;
  }
  if (recorded !== undefined && recorded.length !== added.length) {
    throw new Error("invariant: recorded team names do not match the new teams");
  }
  const used = survivingTeamNames(previous, next);
  const assigned = new Map<string, string | null>();
  added.forEach((team, index) => {
    const name = recorded === undefined ? firstFreeName(used) : (recorded[index] ?? null);
    assigned.set(team.id, name);
    if (name !== null) {
      used.add(name);
    }
  });
  const teams: Team[] = next.teams.map((team) => {
    const name = known.has(team.id) ? (known.get(team.id) ?? null) : (assigned.get(team.id) ?? null);
    return team.name === name ? team : { ...team, name };
  });
  return { ...next, teams };
}

export function drawTeamNames(
  previous: MatchState | null,
  next: MatchState,
  rng: () => number,
): (string | null)[] {
  const known = previousTeamNames(previous);
  const used = survivingTeamNames(previous, next);
  const names: (string | null)[] = [];
  for (const team of next.teams) {
    if (known.has(team.id)) {
      continue;
    }
    const name = pickFreeName(used, rng);
    names.push(name);
    if (name !== null) {
      used.add(name);
    }
  }
  return names;
}
