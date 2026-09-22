import { describe, it, expect } from "vitest";
import { decideCreate } from "./create";
import { applyEvent } from "../apply-event";
import { DomainError } from "../../../shared/errors/domain-error";
import type { MatchConfig } from "../types";
import type { CommandContext } from "./types";

const config: MatchConfig = {
  teamSize: 5,
  colors: ["verde", "vermelho"],
  gameMinutes: 10,
};

function ctxFor(playerIds: string[], teamIds: string[]): CommandContext {
  const ids = [...playerIds, ...teamIds];
  let index = 0;
  return {
    random: () => 0,
    nextId: () => {
      const id = ids[index];
      if (id === undefined) {
        throw new Error("ran out of ids");
      }
      index++;
      return id;
    },
    timerRunning: false,
  };
}

describe("CEN-1: decideCreate", () => {
  it("shuffles and records every generated id in the event payload", () => {
    const playerNames = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const ctx = ctxFor(
      Array.from({ length: 12 }, (_, i) => `p${i}`),
      ["t0", "t1"],
    );
    const result = decideCreate(null, { type: "create", playerNames, config }, ctx);
    if (!("event" in result)) {
      throw new Error("expected an event");
    }
    expect(result.event.type).toBe("MATCH_CREATED");
    if (result.event.type !== "MATCH_CREATED") {
      return;
    }
    expect(result.event.teamIds).toEqual(["t0", "t1"]);
    expect(result.event.players).toHaveLength(12);

    const stateA = applyEvent(null, result.event);
    const stateB = applyEvent(null, result.event);
    expect(stateB).toEqual(stateA);
  });

  it("CEN-2: rejects duplicate names (case/space insensitive)", () => {
    const ctx = ctxFor(["p0", "p1"], ["t0"]);
    expect(() =>
      decideCreate(
        null,
        { type: "create", playerNames: ["Ana", "ana "], config },
        ctx,
      ),
    ).toThrow(DomainError);
    try {
      decideCreate(
        null,
        { type: "create", playerNames: ["Ana", "ana "], config },
        ctxFor(["p0", "p1"], ["t0"]),
      );
    } catch (error) {
      expect((error as DomainError).code).toBe("DUPLICATE_PLAYER_NAMES");
    }
  });
});
