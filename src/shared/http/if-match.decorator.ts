import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

export function ifMatchFactory(_data: unknown, context: ExecutionContext): number {
  const request = context.switchToHttp().getRequest<Request>();
  const value = request.headers["if-match"];

  if (value === undefined || !/^\d+$/.test(value)) {
    throw new BadRequestException("If-Match header must be a non-negative integer");
  }

  return Number.parseInt(value, 10);
}

export const IfMatch = createParamDecorator(ifMatchFactory);
