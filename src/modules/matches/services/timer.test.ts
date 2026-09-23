import { describe, expect, it } from "vitest";
import type { MatchTimer } from "../repositories/matches.repository";
import { elapsedMs, isRunning, pause, reset, start } from "./timer";

const at = (time: string): Date => new Date(`2026-09-22T${time}.000Z`);

describe("timer", () => {
  it("CEN-1: start from a stopped timer records now and keeps elapsedMs", () => {
    const timer: MatchTimer = { startedAt: null, elapsedMs: 30000 };

    const started = start(timer, at("12:00:00"));

    expect(started).toEqual({ startedAt: at("12:00:00"), elapsedMs: 30000 });
    expect(isRunning(started)).toBe(true);
    expect(isRunning(timer)).toBe(false);
  });

  it("CEN-2: start on a running timer returns the same timer", () => {
    const timer: MatchTimer = { startedAt: at("12:00:00"), elapsedMs: 0 };

    const result = start(timer, at("12:00:10"));

    expect(result).toBe(timer);
    expect(result).toEqual({ startedAt: at("12:00:00"), elapsedMs: 0 });
  });

  it("CEN-3: pause accumulates the running span and elapsedMs is live", () => {
    const timer: MatchTimer = { startedAt: at("12:00:00"), elapsedMs: 30000 };

    expect(elapsedMs(timer, at("12:01:00"))).toBe(90000);
    const paused = pause(timer, at("12:01:00"));
    expect(paused).toEqual({ startedAt: null, elapsedMs: 90000 });
    expect(elapsedMs(paused, at("12:05:00"))).toBe(90000);

    const pausedAgain = pause(start(paused, at("12:02:00")), at("12:02:10"));
    expect(pausedAgain).toEqual({ startedAt: null, elapsedMs: 100000 });
  });

  it("CEN-4: pause on a stopped timer is a no-op and a clock going backwards never goes negative", () => {
    const stopped: MatchTimer = { startedAt: null, elapsedMs: 5000 };
    const future: MatchTimer = { startedAt: at("12:00:10"), elapsedMs: 0 };

    expect(pause(stopped, at("12:00:00"))).toBe(stopped);
    expect(pause(future, at("12:00:00"))).toEqual({ startedAt: null, elapsedMs: 0 });
    expect(elapsedMs(future, at("12:00:00"))).toBe(0);
  });

  it("CEN-5: reset zeroes the timer", () => {
    const timer: MatchTimer = { startedAt: at("12:00:00"), elapsedMs: 30000 };

    expect(reset(timer)).toEqual({ startedAt: null, elapsedMs: 0 });
  });

  it("CEN-5: reset on an already zeroed timer returns the same timer", () => {
    const timer: MatchTimer = { startedAt: null, elapsedMs: 0 };

    expect(reset(timer)).toBe(timer);
  });
});
