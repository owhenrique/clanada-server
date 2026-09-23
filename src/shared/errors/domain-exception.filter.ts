import type { ArgumentsHost, ExceptionFilter, LoggerService } from "@nestjs/common";
import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError, VersionConflictError, type DomainErrorCode } from "./domain-error";
import { isDatabaseUnavailableError } from "./infra-error";

type RequestWithId = Request & { id?: string | number };

const HTTP_STATUS_BY_DOMAIN_ERROR_CODE: Record<DomainErrorCode, number> = {
  MATCH_NOT_FOUND: HttpStatus.NOT_FOUND,
  VERSION_CONFLICT: HttpStatus.PRECONDITION_FAILED,
  INVALID_STATUS: HttpStatus.UNPROCESSABLE_ENTITY,
  DUPLICATE_PLAYER_NAMES: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_ENOUGH_TEAMS: HttpStatus.UNPROCESSABLE_ENTITY,
  PLAYER_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
  TEAM_NOT_ON_FIELD: HttpStatus.UNPROCESSABLE_ENTITY,
  PLAYER_LOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_DONOR_AVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  TIMER_RUNNING: HttpStatus.UNPROCESSABLE_ENTITY,
  TEAM_SIZE_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  NOTHING_TO_UNDO: HttpStatus.UNPROCESSABLE_ENTITY,
  TOO_MANY_LOOKUPS: HttpStatus.TOO_MANY_REQUESTS,
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService = new Logger(DomainExceptionFilter.name)) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    if (exception instanceof VersionConflictError) {
      response.status(HTTP_STATUS_BY_DOMAIN_ERROR_CODE[exception.code]).json(exception.view);
      return;
    }

    if (exception instanceof DomainError) {
      response.status(HTTP_STATUS_BY_DOMAIN_ERROR_CODE[exception.code]).json({ code: exception.code });
      return;
    }

    if (exception instanceof HttpException) {
      if (exception.getStatus() >= 500) {
        this.logger.error({ err: exception, ...this.requestContext(http.getRequest<RequestWithId>()) }, "Http exception");
      }
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const context = this.requestContext(http.getRequest<RequestWithId>());
    const err = exception instanceof Error ? exception : new Error(String(exception));

    if (isDatabaseUnavailableError(exception)) {
      this.logger.error({ err, ...context }, "Database unavailable");
      this.respond(response, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
      return;
    }

    this.logger.error({ err, ...context }, "Unhandled exception");
    this.respond(response, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL");
  }

  private respond(response: Response, status: number, code: string): void {
    if (response.headersSent) {
      return;
    }
    response.status(status).json({ code });
  }

  private requestContext(request: RequestWithId): { method: string; url: string; requestId?: string | number } {
    return { method: request.method, url: request.originalUrl, requestId: request.id };
  }
}
