import { describe, it, expect } from "vitest";
import { decide } from "./commands";
import { applyEvent } from "./apply-event";
import { replay } from "./replay";
import { assertValidState } from "./invariants";
import { flattenPlayers } from "./rules/flatten";
import type { MatchState, Player } from "./types";
import type { Command } from "./commands/types";
import type { Event } from "./events";

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${n++}`;
}

type ActiveOption = "swap" | "win" | "draw" | "join" | "leave";

function activeOptions(state: MatchState): ActiveOption[] {
  const options: ActiveOption[] = ["swap", "win", "draw"];
  if (state.queue.length + 1 < state.config.teamSize) {
    options.push("join");
  }
  if (state.queue.length > 0 || state.teams.length > 2) {
    options.push("leave");
  }
  return options;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error("invariant: pick requires a non-empty list");
  }
  return item;
}

function pickPlayer(state: MatchState, rng: () => number): Player {
  return pick(flattenPlayers(state), rng);
}

function pickCommand(state: MatchState, rng: () => number): Command {
  if (state.status === "DRAFT") {
    return pick<Command>([{ type: "reshuffle" }, { type: "start" }], rng);
  }
  const option = pick(activeOptions(state), rng);
  switch (option) {
    case "swap": {
      const a = pickPlayer(state, rng);
      const b = pickPlayer(state, rng);
      return { type: "swap", playerAId: a.id, playerBId: b.id };
    }
    case "win": {
      const [first, second] = state.teams;
      if (first === undefined || second === undefined) {
        throw new Error("invariant: ACTIVE state requires two on-field teams");
      }
      return { type: "win", loserTeamId: rng() < 0.5 ? first.id : second.id };
    }
    case "draw":
      return { type: "draw" };
    case "join":
      return { type: "join", name: `Novo${Math.floor(rng() * 1_000_000)}` };
    case "leave": {
      const player = pickPlayer(state, rng);
      return { type: "leave", playerId: player.id };
    }
  }
}

describe("CEN-28: property — 500 valid random commands never break an invariant", () => {
  it("keeps every invariant valid and matches an incremental replay", () => {
    const rng = mulberry32(42);
    const ctx = { random: rng, nextId: idFactory("id"), timerRunning: false };

    const createResult = decide(
      null,
      {
        type: "create",
        playerNames: Array.from({ length: 22 }, (_, i) => `Player${i}`),
        config: { teamSize: 5, colors: ["verde", "vermelho", "azul"], gameMinutes: 10 },
      },
      ctx,
    );
    if (!("event" in createResult)) {
      throw new Error("expected create to produce an event");
    }

    const events: Event[] = [createResult.event];
    let state = applyEvent(null, createResult.event);
    assertValidState(state);

    for (let step = 0; step < 500; step++) {
      const command = pickCommand(state, rng);
      const result = decide(state, command, ctx);
      if ("penaltiesRequired" in result) {
        continue;
      }
      events.push(result.event);
      state = applyEvent(state, result.event);
      assertValidState(state);
    }

    expect(events.length).toBeGreaterThan(1);
    expect(replay(events)).toEqual(state);
  });
});
