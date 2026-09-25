import { describe, expect, it } from "vitest";
import { CryptoRandomSource } from "./random-source";

describe("CryptoRandomSource", () => {
  it("F9 CEN-11: returns values in [0, 1)", () => {
    const random = new CryptoRandomSource();
    for (let i = 0; i < 1000; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
