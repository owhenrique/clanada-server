import { execSync } from "node:child_process";
import { ConfigService } from "@nestjs/config";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateEnv, type Env } from "../src/infra/config/env.schema";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { PrismaMatchesRepository } from "../src/modules/matches/repositories/prisma-matches.repository";
import {
  createdFixture,
  runMatchesRepositoryContract,
} from "../src/modules/matches/repositories/matches-repository-contract-test";

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

describe("PrismaMatchesRepository legacy split JSON", () => {
  it("falls back to paidCents when receivedCents is missing and keeps received as stored", async () => {
    const repository = new PrismaMatchesRepository(prisma);
    const { event, snapshot } = createdFixture();
    const created = await repository.create({ code: "LEGACY01", event, snapshot });
    const [payer, out, flagged] = snapshot.teams.flatMap((team) => team.players);
    if (payer === undefined || out === undefined || flagged === undefined) {
      throw new Error("missing fixture players");
    }

    await prisma.match.update({
      where: { id: created.id },
      data: {
        split: {
          players: {
            [payer.id]: { pays: true, paidCents: 10000, received: false },
            [out.id]: { pays: false, paidCents: 2000, received: false },
            [flagged.id]: { pays: true, received: true },
          },
        },
      },
    });

    const stored = await repository.findByCode("LEGACY01");

    expect(stored?.split).toEqual({
      players: {
        [payer.id]: { pays: true, received: false, receivedCents: 10000 },
        [out.id]: { pays: false, received: false, receivedCents: 2000 },
        [flagged.id]: { pays: true, received: true, receivedCents: 0 },
      },
    });
  });
});
