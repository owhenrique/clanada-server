import { describe, expect, it, vi } from "vitest";
import { reportFatalError } from "./fatal-error";

describe("reportFatalError", () => {
  it("logs the structured error at fatal level and exits with code 1", () => {
    const fatal = vi.fn();
    const exit = vi.fn();
    const failure = new Error("connect ECONNREFUSED");

    reportFatalError({ fatal }, exit, failure, "Failed to start application");

    expect(fatal).toHaveBeenCalledWith({ err: failure }, "Failed to start application");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("wraps non-Error values so the log still carries an error", () => {
    const fatal = vi.fn();

    reportFatalError({ fatal }, vi.fn(), "boom", "Unhandled rejection");

    expect(fatal).toHaveBeenCalledWith({ err: new Error("boom") }, "Unhandled rejection");
  });
});
