import type { ArgumentsHost } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DomainError, VersionConflictError, type DomainErrorCode } from "./domain-error";
import { DomainExceptionFilter } from "./domain-exception.filter";

type MockHost = {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createMockHost(): MockHost {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
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
  ];

  it.each(statusByCode)("maps %s to HTTP %i", (code, expectedStatus) => {
    const filter = new DomainExceptionFilter();
    const { host, status, json } = createMockHost();

    filter.catch(new DomainError(code), host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({ code });
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
});
