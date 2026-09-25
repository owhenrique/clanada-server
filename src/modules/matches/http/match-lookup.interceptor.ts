import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { catchError, throwError, type Observable } from "rxjs";
import { DomainError } from "../../../shared/errors/domain-error";
import { isMatchCode } from "../repositories/match-code";
import { LookupMissLimiter } from "../services/lookup-miss-limiter";

type LookupRequest = {
  ip?: string;
  params: Record<string, string | undefined>;
};

@Injectable()
export class MatchLookupInterceptor implements NestInterceptor {
  constructor(private readonly limiter: LookupMissLimiter) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<LookupRequest>();
    const code = request.params.code;
    if (code === undefined) {
      return next.handle();
    }
    const ip = request.ip ?? "";
    if (this.limiter.isBlocked(ip)) {
      return throwError(() => new DomainError("TOO_MANY_LOOKUPS"));
    }
    if (!isMatchCode(code)) {
      this.limiter.recordMiss(ip);
      return throwError(() => new DomainError("MATCH_NOT_FOUND"));
    }
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof DomainError && error.code === "MATCH_NOT_FOUND") {
          this.limiter.recordMiss(ip);
        }
        return throwError(() => error);
      }),
    );
  }
}
