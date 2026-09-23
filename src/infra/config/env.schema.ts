import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_GLOBAL_LIMIT: z.coerce.number().int().positive().default(120),
  THROTTLE_CREATE_LIMIT: z.coerce.number().int().positive().default(10),
  THROTTLE_LOOKUP_MISS_LIMIT: z.coerce.number().int().positive().default(10),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
