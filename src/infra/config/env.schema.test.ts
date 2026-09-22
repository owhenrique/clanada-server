import { describe, expect, it } from "vitest";
import { envSchema } from "./env.schema";

describe("envSchema", () => {
  const validRawEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/clanada",
    NODE_ENV: "development",
  };

  it("parses a valid environment", () => {
    const result = envSchema.parse(validRawEnv);

    expect(result.DATABASE_URL).toBe(validRawEnv.DATABASE_URL);
    expect(result.NODE_ENV).toBe("development");
  });

  it("applies the default PORT when it is not provided", () => {
    const result = envSchema.parse(validRawEnv);

    expect(result.PORT).toBe(3001);
  });

  it("applies the default LOG_LEVEL when it is not provided", () => {
    const result = envSchema.parse(validRawEnv);

    expect(result.LOG_LEVEL).toBe("info");
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omitted, ...rest } = validRawEnv;

    expect(() => envSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid DATABASE_URL", () => {
    expect(() => envSchema.parse({ ...validRawEnv, DATABASE_URL: "not-a-valid-url" })).toThrow();
  });

  it("coerces a numeric string PORT into a number", () => {
    const result = envSchema.parse({ ...validRawEnv, PORT: "4000" });

    expect(result.PORT).toBe(4000);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => envSchema.parse({ ...validRawEnv, PORT: "not-a-port" })).toThrow();
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() => envSchema.parse({ ...validRawEnv, NODE_ENV: "staging" })).toThrow();
  });

  it("accepts an explicit LOG_LEVEL", () => {
    const result = envSchema.parse({ ...validRawEnv, LOG_LEVEL: "debug" });

    expect(result.LOG_LEVEL).toBe("debug");
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() => envSchema.parse({ ...validRawEnv, LOG_LEVEL: "not-a-level" })).toThrow();
  });
});
