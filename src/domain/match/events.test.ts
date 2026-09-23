import { describe, it, expect } from "vitest";
import { UNDOABLE_EVENTS } from "./events";

describe("CEN-20: UNDOABLE_EVENTS", () => {
  it("contains only the events regra 12 lists as undoable", () => {
    expect([...UNDOABLE_EVENTS].sort()).toEqual(
      [
        "GAME_DRAWN",
        "GAME_WON",
        "PLAYERS_SWAPPED",
        "PLAYER_JOINED",
        "PLAYER_LEFT",
        "TEAM_SIZE_CHANGED",
      ].sort(),
    );
  });

  it("does not undo past the lifecycle events", () => {
    expect(UNDOABLE_EVENTS.has("MATCH_CREATED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("RESHUFFLED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("MATCH_STARTED")).toBe(false);
    expect(UNDOABLE_EVENTS.has("MATCH_ENDED")).toBe(false);
  });
});
