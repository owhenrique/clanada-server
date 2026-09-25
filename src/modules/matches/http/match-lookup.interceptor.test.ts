import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { lastValueFrom, of, throwError, type Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../../infra/config/env.schema";
import { DomainError } from "../../../shared/errors/domain-error";
import type { Clock } from "../../../shared/ports/clock";
import { LookupMissLimiter } from "../services/lookup-miss-limiter";
import { MatchLookupInterceptor } from "./match-lookup.interceptor";

const clock: Clock = { now: () => new Date("2026-09-25T12:00:00.000Z") };

function makeInterceptor(limit: number): MatchLookupInterceptor {
  const values: Partial<Env> = { THROTTLE_LOOKUP_MISS_LIMIT: limit, THROTTLE_TTL_MS: 60000 };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  return new MatchLookupInterceptor(new LookupMissLimiter(clock, config));
}

function contextFor(ip: string, params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip, params }) }),
  } as unknown as ExecutionContext;
}

function spyHandler(result: () => Observable<unknown>): { handler: CallHandler; handle: ReturnType<typeof vi.fn> } {
  const handle = vi.fn(result);
  return { handler: { handle }, handle };
}

function handlerReturning(result: () => Observable<unknown>): CallHandler {
  return { handle: result };
}

const found = (): Observable<unknown> => of({ code: "M9268NST" });
const notFound = (): Observable<unknown> => throwError(() => new DomainError("MATCH_NOT_FOUND"));

async function run(
  interceptor: MatchLookupInterceptor,
  ip: string,
  params: Record<string, string>,
  handler: CallHandler,
): Promise<unknown> {
  return lastValueFrom(interceptor.intercept(contextFor(ip, params), handler)).catch((error: unknown) => error);
}

describe("MatchLookupInterceptor", () => {
  it("F9 CEN-6: an out-of-format code is a miss answered with MATCH_NOT_FOUND without calling the handler", async () => {
    const interceptor = makeInterceptor(2);
    const { handler, handle } = spyHandler(found);

    expect(await run(interceptor, "1.1.1.1", { code: "abc" }, handler)).toMatchObject({ code: "MATCH_NOT_FOUND" });
    expect(await run(interceptor, "1.1.1.1", { code: "abc" }, handler)).toMatchObject({ code: "MATCH_NOT_FOUND" });
    expect(await run(interceptor, "1.1.1.1", { code: "M9268NST" }, handler)).toMatchObject({ code: "TOO_MANY_LOOKUPS" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("F9 CEN-7: MATCH_NOT_FOUND from any :code route counts a miss", async () => {
    const interceptor = makeInterceptor(2);

    expect(await run(interceptor, "1.1.1.1", { code: "ZZZZZZZZ" }, handlerReturning(notFound))).toMatchObject({
      code: "MATCH_NOT_FOUND",
    });
    expect(await run(interceptor, "1.1.1.1", { code: "ZZZZZZZZ" }, handlerReturning(notFound))).toMatchObject({
      code: "MATCH_NOT_FOUND",
    });
    expect(await run(interceptor, "1.1.1.1", { code: "ZZZZZZZZ" }, handlerReturning(notFound))).toMatchObject({
      code: "TOO_MANY_LOOKUPS",
    });
  });

  it("F9 CEN-8: a blocked IP gets TOO_MANY_LOOKUPS for an existing code while another IP goes through", async () => {
    const interceptor = makeInterceptor(1);
    await run(interceptor, "1.1.1.1", { code: "ZZZZZZZZ" }, handlerReturning(notFound));
    const { handler, handle } = spyHandler(found);

    expect(await run(interceptor, "1.1.1.1", { code: "M9268NST" }, handler)).toMatchObject({ code: "TOO_MANY_LOOKUPS" });
    expect(handle).not.toHaveBeenCalled();
    expect(await run(interceptor, "2.2.2.2", { code: "M9268NST" }, handler)).toEqual({ code: "M9268NST" });
  });

  it("F9 CEN-9: routes without :code are not limited", async () => {
    const interceptor = makeInterceptor(1);
    await run(interceptor, "1.1.1.1", { code: "ZZZZZZZZ" }, handlerReturning(notFound));

    expect(await run(interceptor, "1.1.1.1", {}, handlerReturning(found))).toEqual({ code: "M9268NST" });
  });

  it("F9 CEN-7: other errors do not count as a miss", async () => {
    const interceptor = makeInterceptor(1);
    const invalid = handlerReturning(() => throwError(() => new DomainError("INVALID_STATUS")));

    expect(await run(interceptor, "1.1.1.1", { code: "M9268NST" }, invalid)).toMatchObject({ code: "INVALID_STATUS" });
    expect(await run(interceptor, "1.1.1.1", { code: "M9268NST" }, handlerReturning(found))).toEqual({ code: "M9268NST" });
  });
});
