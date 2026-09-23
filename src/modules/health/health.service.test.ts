import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import { isDatabaseUnavailableError } from "../../shared/errors/infra-error";
import { HealthService } from "./health.service";

function prismaWith(queryRaw: () => Promise<unknown>): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe("HealthService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ok when the database answers", async () => {
    const service = new HealthService(prismaWith(() => Promise.resolve([{ "?column?": 1 }])));

    await expect(service.check()).resolves.toEqual({ status: "ok" });
  });

  it("propagates the database error so it can be logged by the exception filter", async () => {
    const failure = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
    const service = new HealthService(prismaWith(() => Promise.reject(failure)));

    await expect(service.check()).rejects.toBe(failure);
  });

  it("fails with a database-unavailable error when the query hangs", async () => {
    vi.useFakeTimers();
    const service = new HealthService(prismaWith(() => new Promise<never>(() => undefined)));

    const result = service.check().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(isDatabaseUnavailableError(await result)).toBe(true);
  });
});
