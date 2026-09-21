import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ifMatchFactory } from "./if-match.decorator";

function createContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe("ifMatchFactory", () => {
  it("parses a valid non-negative integer header", () => {
    const context = createContext({ "if-match": "3" });

    expect(ifMatchFactory(undefined, context)).toBe(3);
  });

  it("parses zero as a valid version", () => {
    const context = createContext({ "if-match": "0" });

    expect(ifMatchFactory(undefined, context)).toBe(0);
  });

  it("throws BadRequestException when the header is missing", () => {
    const context = createContext({});

    expect(() => ifMatchFactory(undefined, context)).toThrow(BadRequestException);
  });

  it("throws BadRequestException when the header is not numeric", () => {
    const context = createContext({ "if-match": "abc" });

    expect(() => ifMatchFactory(undefined, context)).toThrow(BadRequestException);
  });

  it("throws BadRequestException for a negative number", () => {
    const context = createContext({ "if-match": "-1" });

    expect(() => ifMatchFactory(undefined, context)).toThrow(BadRequestException);
  });

  it("throws BadRequestException for a non-integer number", () => {
    const context = createContext({ "if-match": "1.5" });

    expect(() => ifMatchFactory(undefined, context)).toThrow(BadRequestException);
  });
});
