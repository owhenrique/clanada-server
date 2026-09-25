import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { Env } from "../../../infra/config/env.schema";
import type { Clock } from "../../../shared/ports/clock";
import { LookupMissLimiter } from "./lookup-miss-limiter";

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

function fakeConfig(values: Partial<Env>): ConfigService<Env, true> {
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

describe("LookupMissLimiter", () => {
  it("CEN-12: blocks an IP after the miss limit within the window and frees it after the window", () => {
    const clock = new MutableClock(new Date("2026-09-22T12:00:00.000Z"));
    const limiter = new LookupMissLimiter(
      clock,
      fakeConfig({ THROTTLE_LOOKUP_MISS_LIMIT: 3, THROTTLE_TTL_MS: 60000 }),
    );

    limiter.recordMiss("1.1.1.1");
    limiter.recordMiss("1.1.1.1");
    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
    limiter.recordMiss("1.1.1.1");

    expect(limiter.isBlocked("1.1.1.1")).toBe(true);
    expect(limiter.isBlocked("2.2.2.2")).toBe(false);

    clock.advance(60000);
    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
  });

  it("CEN-12: a miss after the window expires starts a new window", () => {
    const clock = new MutableClock(new Date("2026-09-22T12:00:00.000Z"));
    const limiter = new LookupMissLimiter(
      clock,
      fakeConfig({ THROTTLE_LOOKUP_MISS_LIMIT: 2, THROTTLE_TTL_MS: 60000 }),
    );

    limiter.recordMiss("1.1.1.1");
    clock.advance(60000);
    limiter.recordMiss("1.1.1.1");

    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
  });

  it("F9 CEN-10: at the IP cap, a new IP evicts expired windows first", () => {
    const clock = new MutableClock(new Date("2026-09-22T12:00:00.000Z"));
    const limiter = new LookupMissLimiter(
      clock,
      fakeConfig({ THROTTLE_LOOKUP_MISS_LIMIT: 1, THROTTLE_TTL_MS: 60000 }),
      3,
    );

    limiter.recordMiss("A");
    clock.advance(30000);
    limiter.recordMiss("B");
    limiter.recordMiss("C");
    clock.advance(30000);
    limiter.recordMiss("D");

    expect(limiter.trackedIps()).toEqual(["B", "C", "D"]);
  });

  it("F9 CEN-10: at the IP cap with nothing expired, the oldest IP is evicted", () => {
    const clock = new MutableClock(new Date("2026-09-22T12:00:00.000Z"));
    const limiter = new LookupMissLimiter(
      clock,
      fakeConfig({ THROTTLE_LOOKUP_MISS_LIMIT: 1, THROTTLE_TTL_MS: 60000 }),
      3,
    );

    limiter.recordMiss("A");
    limiter.recordMiss("B");
    limiter.recordMiss("C");
    limiter.recordMiss("D");

    expect(limiter.trackedIps()).toEqual(["B", "C", "D"]);
    expect(limiter.isBlocked("A")).toBe(false);
    expect(limiter.isBlocked("D")).toBe(true);
  });
});
