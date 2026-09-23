import { describe, expect, it } from "vitest";
import {
  applyGameResult,
  compactQueue,
  duplicateGroups,
  flattenPlayers,
  formInitialState,
  hasUnresolvedDuplicates,
  normalizeName,
  playerJoins,
  playerLeaves,
  resolveDraw,
  shuffle,
  swapPlayers,
  type MatchState,
} from "./index";

function makeInitialState(): MatchState {
  return formInitialState(
    Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, name: `P${index}` })),
    { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 },
    (index) => `t${index}`,
  );
}

describe("CEN-3: domain/match public API", () => {
  it("exposes MatchState-shaped state with Team.gameStreak", () => {
    const state = makeInitialState();

    expect(state.teams[0]?.gameStreak).toBe(0);
    expect(state.teams[1]?.gameStreak).toBe(0);
  });

  it("exposes applyGameResult (ex-applyResult), incrementing the winner's gameStreak", () => {
    const state = makeInitialState();

    const next = applyGameResult(state, "t1", () => "new");

    expect(next.teams.map((team) => team.id)).toEqual(["t0", "t1"]);
    expect(next.teams[0]?.gameStreak).toBe(1);
  });

  it("re-exports the rest of the rule functions unchanged", () => {
    expect(typeof resolveDraw).toBe("function");
    expect(typeof playerJoins).toBe("function");
    expect(typeof playerLeaves).toBe("function");
    expect(typeof swapPlayers).toBe("function");
    expect(typeof shuffle).toBe("function");
    expect(typeof compactQueue).toBe("function");
    expect(typeof flattenPlayers).toBe("function");
    expect(typeof normalizeName).toBe("function");
    expect(typeof duplicateGroups).toBe("function");
    expect(typeof hasUnresolvedDuplicates).toBe("function");
  });
});
