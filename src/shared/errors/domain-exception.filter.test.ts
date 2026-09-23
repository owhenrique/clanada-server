import { BadRequestException, type ArgumentsHost, type LoggerService } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DomainError, VersionConflictError, type DomainErrorCode } from "./domain-error";
import { DomainExceptionFilter } from "./domain-exception.filter";

type MockHost = {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createMockHost(headersSent = false): MockHost {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status, headersSent };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ id: "req-1", method: "GET", originalUrl: "/api/matches", headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function createMockLogger(): { logger: LoggerService; error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
  const error = vi.fn();
  const warn = vi.fn();
  return { logger: { log: vi.fn(), error, warn }, error, warn };
}

describe("DomainExceptionFilter", () => {
  const statusByCode: Array<[DomainErrorCode, number]> = [
    ["MATCH_NOT_FOUND", 404],
    ["VERSION_CONFLICT", 412],
    ["INVALID_STATUS", 422],
    ["DUPLICATE_PLAYER_NAMES", 422],
    ["NOT_ENOUGH_TEAMS", 422],
    ["PLAYER_NOT_FOUND", 422],
    ["TEAM_NOT_ON_FIELD", 422],
    ["PLAYER_LOCKED", 422],
    ["NO_DONOR_AVAILABLE", 422],
    ["TIMER_RUNNING", 422],
    ["TEAM_SIZE_NOT_ALLOWED", 422],
    ["NOTHING_TO_UNDO", 422],
    ["TOO_MANY_LOOKUPS", 429],
  ];

  it.each(statusByCode)("maps %s to HTTP %i", (code, expectedStatus) => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new DomainError(code), host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({ code });
  });

  it("CEN-13: maps TOO_MANY_LOOKUPS to HTTP 429 with body { code: 'TOO_MANY_LOOKUPS' }", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new DomainError("TOO_MANY_LOOKUPS"), host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({ code: "TOO_MANY_LOOKUPS" });
  });

  it("CEN-4: maps MATCH_NOT_FOUND to HTTP 404 with body { code: 'MATCH_NOT_FOUND' }", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new DomainError("MATCH_NOT_FOUND"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ code: "MATCH_NOT_FOUND" });
  });

  it("CEN-16/17: maps VersionConflictError to HTTP 412 with the raw MatchView (no error-code wrapper)", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();
    const view = { code: "AB23CD45", version: 3, status: "DRAFT" };

    filter.catch(new VersionConflictError(view), host);

    expect(status).toHaveBeenCalledWith(412);
    expect(json).toHaveBeenCalledWith(view);
  });

  it("CEN-3/CEN-15: passes through a NestJS HttpException with its own status and body (e.g. ValidationPipe/@IfMatch failures)", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new BadRequestException("If-Match header must be a non-negative integer"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      message: "If-Match header must be a non-negative integer",
      error: "Bad Request",
      statusCode: 400,
    });
  });

  it("maps an unexpected error to 500 with code INTERNAL", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new Error("unexpected failure"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: "INTERNAL" });
  });

  it("maps a non-Error thrown value to 500 with code INTERNAL", () => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch("some string was thrown", host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: "INTERNAL" });
  });

  it("logs unexpected errors with the structured error, method, url and request id", () => {
    const { logger, error } = createMockLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host } = createMockHost();
    const failure = new Error("secret internal detail");

    filter.catch(failure, host);

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, method: "GET", url: "/api/matches", requestId: "req-1" }),
      "Unhandled exception",
    );
  });

  it("does not leak the error message in the response body", () => {
    const filter = new DomainExceptionFilter(createMockLogger().logger);
    const { host, json } = createMockHost();

    filter.catch(new Error("secret internal detail"), host);

    expect(JSON.stringify(json.mock.calls)).not.toContain("secret internal detail");
  });

  it.each([
    ["Prisma P1001", Object.assign(new Error("Can't reach database"), { code: "P1001" })],
    ["ECONNREFUSED", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })],
    ["wrapped cause", new Error("adapter failure", { cause: Object.assign(new Error("x"), { code: "ECONNREFUSED" }) })],
  ])("maps a database connection failure (%s) to 503 SERVICE_UNAVAILABLE and logs it", (_name, failure) => {
    const { logger, error } = createMockLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, status, json } = createMockHost();

    filter.catch(failure, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ code: "SERVICE_UNAVAILABLE" });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: failure }), "Database unavailable");
  });

  it("keeps the framework status and body for HttpException without logging an error", () => {
    const { logger, error } = createMockLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, status, json } = createMockHost();
    const exception = new BadRequestException("invalid payload");

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
    expect(error).not.toHaveBeenCalled();
  });

  it("logs the error but does not write when headers were already sent", () => {
    const { logger, error } = createMockLogger();
    const filter = new DomainExceptionFilter(logger);
    const { host, status } = createMockHost(true);

    filter.catch(new Error("late failure"), host);

    expect(error).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});
