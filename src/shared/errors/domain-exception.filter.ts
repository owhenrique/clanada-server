import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { DomainError, type DomainErrorCode } from "./domain-error";

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
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(HTTP_STATUS_BY_DOMAIN_ERROR_CODE[exception.code]).json({ code: exception.code });
      return;
    }

    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error("Unhandled exception", stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: "INTERNAL" });
  }
}
