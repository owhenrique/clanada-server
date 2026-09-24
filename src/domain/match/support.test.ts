import { describe, it, expect } from "vitest";
import { shuffle } from "./support";

function seq(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("CEN-6: shuffle", () => {
  it("does not mutate the input", () => {
    const items = ["a", "b", "c", "d"];
    shuffle(items, () => 0);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps all elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    const result = shuffle(items, seq([0.1, 0.7, 0.3, 0.9]));
    expect([...result].sort()).toEqual([...items].sort());
    expect(result).toHaveLength(items.length);
  });

  it("produces a deterministic order for a given rng", () => {
    expect(shuffle(["a", "b", "c", "d"], () => 0)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("returns a single element unchanged", () => {
    expect(shuffle(["a"], () => 0)).toEqual(["a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(shuffle([], () => 0)).toEqual([]);
  });
});
