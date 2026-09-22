import { execSync } from "node:child_process";
import { ConfigService } from "@nestjs/config";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll } from "vitest";
import { validateEnv, type Env } from "../src/infra/config/env.schema";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { PrismaMatchesRepository } from "../src/modules/matches/prisma-matches.repository";
import { runMatchesRepositoryContract } from "../src/modules/matches/matches-repository-contract-test";

let container: StartedPostgreSqlContainer;
let prisma: PrismaService;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  const databaseUrl = container.getConnectionUri();

  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const env = validateEnv({
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
  });
  prisma = new PrismaService(new ConfigService<Env, true>(env));
  await prisma.$connect();
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

runMatchesRepositoryContract(
  "prisma",
  () => new PrismaMatchesRepository(prisma),
);
