import type { MatchTimer } from "../repositories/matches.repository";

export type TimerAction = "start" | "pause" | "reset";

export function isRunning(timer: MatchTimer): boolean {
  return timer.startedAt !== null;
}

export function elapsedMs(timer: MatchTimer, now: Date): number {
  if (timer.startedAt === null) {
    return timer.elapsedMs;
  }
  return timer.elapsedMs + Math.max(0, now.getTime() - timer.startedAt.getTime());
}

export function start(timer: MatchTimer, now: Date): MatchTimer {
  if (isRunning(timer)) {
    return timer;
  }
  return { startedAt: now, elapsedMs: timer.elapsedMs };
}

export function pause(timer: MatchTimer, now: Date): MatchTimer {
  if (!isRunning(timer)) {
    return timer;
  }
  return { startedAt: null, elapsedMs: elapsedMs(timer, now) };
}

export function reset(timer: MatchTimer): MatchTimer {
  if (!isRunning(timer) && timer.elapsedMs === 0) {
    return timer;
  }
  return { startedAt: null, elapsedMs: 0 };
}

export function applyTimerAction(timer: MatchTimer, action: TimerAction, now: Date): MatchTimer {
  const handlers: Record<TimerAction, () => MatchTimer> = {
    start: () => start(timer, now),
    pause: () => pause(timer, now),
    reset: () => reset(timer),
  };
  return handlers[action]();
}
