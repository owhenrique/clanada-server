import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../infra/config/env.schema";
import { Clock } from "../../../shared/ports/clock";

export const MAX_TRACKED_IPS = 10_000;
export const MAX_TRACKED_IPS_TOKEN = "MAX_TRACKED_IPS";

type MissWindow = {
  count: number;
  windowStart: number;
};

@Injectable()
export class LookupMissLimiter {
  private readonly windows = new Map<string, MissWindow>();
  private readonly limit: number;
  private readonly ttlMs: number;

  constructor(
    private readonly clock: Clock,
    configService: ConfigService<Env, true>,
    @Optional() @Inject(MAX_TRACKED_IPS_TOKEN) private readonly maxTrackedIps: number = MAX_TRACKED_IPS,
  ) {
    this.limit = configService.get("THROTTLE_LOOKUP_MISS_LIMIT", { infer: true });
    this.ttlMs = configService.get("THROTTLE_TTL_MS", { infer: true });
  }

  isBlocked(ip: string): boolean {
    const window = this.currentWindow(ip);
    return window !== undefined && window.count >= this.limit;
  }

  recordMiss(ip: string): void {
    const window = this.currentWindow(ip);
    if (window === undefined) {
      this.makeRoom();
      this.windows.set(ip, { count: 1, windowStart: this.clock.now().getTime() });
      return;
    }
    window.count += 1;
  }

  trackedIps(): string[] {
    return [...this.windows.keys()];
  }

  private makeRoom(): void {
    if (this.windows.size < this.maxTrackedIps) {
      return;
    }
    for (const ip of [...this.windows.keys()]) {
      this.currentWindow(ip);
    }
    const oldest = this.windows.keys().next();
    if (this.windows.size >= this.maxTrackedIps && oldest.done !== true) {
      this.windows.delete(oldest.value);
    }
  }

  private currentWindow(ip: string): MissWindow | undefined {
    const window = this.windows.get(ip);
    if (window === undefined) {
      return undefined;
    }
    if (this.clock.now().getTime() - window.windowStart >= this.ttlMs) {
      this.windows.delete(ip);
      return undefined;
    }
    return window;
  }
}
