import { describe, expect, it } from "vitest";
import { isDatabaseUnavailableError } from "./infra-error";

describe("isDatabaseUnavailableError", () => {
  it.each(["P1001", "P1002", "P1017", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND"])(
    "returns true for code %s",
    (code) => {
      expect(isDatabaseUnavailableError(Object.assign(new Error("x"), { code }))).toBe(true);
    },
  );

  it.each(["DatabaseNotReachable", "ConnectionClosed", "SocketTimeout"])(
    "returns true for a Prisma driver adapter error of kind %s",
    (kind) => {
      const error = Object.assign(new Error("Raw query failed"), {
        code: "P2010",
        meta: { driverAdapterError: { name: "DriverAdapterError", cause: { kind } } },
      });
      expect(isDatabaseUnavailableError(error)).toBe(true);
    },
  );

  it("finds the code in the cause chain", () => {
    const root = Object.assign(new Error("root"), { code: "ECONNREFUSED" });
    expect(isDatabaseUnavailableError(new Error("outer", { cause: new Error("mid", { cause: root }) }))).toBe(true);
  });

  it("finds the code inside an AggregateError", () => {
    const inner = Object.assign(new Error("inner"), { code: "ECONNREFUSED" });
    expect(isDatabaseUnavailableError(new AggregateError([inner]))).toBe(true);
  });

  it("returns false for unrelated errors and non-errors", () => {
    expect(isDatabaseUnavailableError(new Error("boom"))).toBe(false);
    expect(isDatabaseUnavailableError(Object.assign(new Error("x"), { code: "P2002" }))).toBe(false);
    expect(isDatabaseUnavailableError("ECONNREFUSED")).toBe(false);
    expect(isDatabaseUnavailableError(null)).toBe(false);
  });
});
