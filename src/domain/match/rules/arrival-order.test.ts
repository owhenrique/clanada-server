import { describe, it, expect } from "vitest";
import { orderPlayers } from "./arrival-order";
import { shuffle } from "./shuffle";
import type { Player } from "../types";

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, name: `P${index + 1}` }));
}

function ids(list: Player[]): string[] {
  return list.map((player) => player.id);
}

const on = { arrivalPriority: true };
const off = { arrivalPriority: false };

describe("orderPlayers", () => {
  it("F4 CEN-1: shuffles only the seated players and keeps the rest in arrival order", () => {
    const order = orderPlayers(players(11), 10, 5, on, () => 0);
    expect(new Set(ids(order.slice(0, 10)))).toEqual(new Set(ids(players(10))));
    expect(ids(order.slice(10))).toEqual(["p11"]);
    expect(ids(order.slice(0, 10))).not.toEqual(ids(players(10)));
  });

  it("F4 CEN-2: keeps several waiting players in arrival order", () => {
    const order = orderPlayers(players(8), 6, 3, on, () => 0);
    expect(ids(order.slice(6))).toEqual(["p7", "p8"]);
  });

  it("F4 CEN-4: shuffles everyone when the rule is off", () => {
    const order = orderPlayers(players(11), 10, 5, off, () => 0);
    expect(ids(order)).toEqual(ids(shuffle(players(11), () => 0)));
  });

  it("F4 CEN-5: with nobody seated, returns the arrival order", () => {
    expect(ids(orderPlayers(players(3), 0, 5, on, () => 0))).toEqual(["p1", "p2", "p3"]);
  });

  it("F6 CEN-1: shuffles only the first 2N seated players and keeps the next teams in arrival order", () => {
    const order = orderPlayers(players(16), 15, 5, on, () => 0);
    expect(new Set(ids(order.slice(0, 10)))).toEqual(new Set(ids(players(10))));
    expect(ids(order.slice(10))).toEqual(ids(players(16).slice(10)));
  });
});
