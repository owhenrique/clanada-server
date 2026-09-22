import { describe, expect, it } from "vitest";
import type { RandomSource } from "../../shared/ports/random-source";
import { MATCH_CODE_ALPHABET, MATCH_CODE_LENGTH, generateMatchCode } from "./match-code";

function fakeRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next: () => {
      const value = values[index % values.length];
      index += 1;
      if (value === undefined) {
        throw new Error("ran out of fake random values");
      }
      return value;
    },
  };
}

describe("CEN-11: generateMatchCode", () => {
  it("generates an 8-character code using only the allowed alphabet", () => {
    const random = fakeRandom([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);

    const code = generateMatchCode(random);

    expect(code).toHaveLength(MATCH_CODE_LENGTH);
    for (const char of code) {
      expect(MATCH_CODE_ALPHABET).toContain(char);
    }
  });

  it("never includes the ambiguous characters 0, O, 1, I, L", () => {
    for (const char of ["0", "O", "1", "I", "L"]) {
      expect(MATCH_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("is deterministic for a deterministic random source", () => {
    const values = [0.01, 0.99, 0.5, 0.25, 0.75, 0.1, 0.6, 0.42];

    const codeA = generateMatchCode(fakeRandom(values));
    const codeB = generateMatchCode(fakeRandom(values));

    expect(codeA).toBe(codeB);
  });
});
