import { describe, it, expect } from "vitest";
import { formInitialState } from "./formation";
import { swapPlayers } from "./swap";
import { flattenPlayers } from "./flatten";
import type { Player } from "../types";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
  }));
}

const teamId = (index: number): string => `t${index}`;

describe("CEN-1: flattenPlayers", () => {
  it("round-trips through formInitialState: teams in order, then the queue", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const flat = flattenPlayers(state);
    expect(flat.map((p) => p.id)).toEqual(makePlayers(12).map((p) => p.id));
    const rebuilt = formInitialState(flat, { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    expect(rebuilt).toEqual(state);
  });

  it("reflects a swap applied before flattening", () => {
    const state = formInitialState(makePlayers(12), { teamSize: 5, colors: ["verde", "vermelho"], gameMinutes: 10 }, teamId);
    const swapped = swapPlayers(state, "p2", "p11");
    const flat = flattenPlayers(swapped);
    expect(flat.map((p) => p.id)).toEqual([
      "p0",
      "p1",
      "p11",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p2",
    ]);
  });
});
