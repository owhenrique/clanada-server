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

  it("CEN-15: applies the default throttle limits and trust proxy hops", () => {
    const result = envSchema.parse(validRawEnv);

    expect(result).toMatchObject({
      THROTTLE_TTL_MS: 60000,
      THROTTLE_GLOBAL_LIMIT: 120,
      THROTTLE_CREATE_LIMIT: 10,
      THROTTLE_LOOKUP_MISS_LIMIT: 10,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("CEN-15: coerces explicit throttle values", () => {
    const result = envSchema.parse({ ...validRawEnv, THROTTLE_CREATE_LIMIT: "2", TRUST_PROXY_HOPS: "1" });

    expect(result.THROTTLE_CREATE_LIMIT).toBe(2);
    expect(result.TRUST_PROXY_HOPS).toBe(1);
  });

  it.each(["THROTTLE_TTL_MS", "THROTTLE_GLOBAL_LIMIT", "THROTTLE_CREATE_LIMIT", "THROTTLE_LOOKUP_MISS_LIMIT"])(
    "CEN-15: rejects %s = 0",
    (key) => {
      expect(() => envSchema.parse({ ...validRawEnv, [key]: "0" })).toThrow();
    },
  );

  it("CEN-15: accepts TRUST_PROXY_HOPS = 0 and rejects a negative value", () => {
    expect(envSchema.parse({ ...validRawEnv, TRUST_PROXY_HOPS: "0" }).TRUST_PROXY_HOPS).toBe(0);
    expect(() => envSchema.parse({ ...validRawEnv, TRUST_PROXY_HOPS: "-1" })).toThrow();
  });
});
