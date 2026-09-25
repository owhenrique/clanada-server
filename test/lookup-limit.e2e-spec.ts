import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type HttpServer = Parameters<typeof request>[0];

function httpServerOf(app: INestApplication): HttpServer {
  return app.getHttpServer() as HttpServer;
}

const createBody = {
  config: { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 },
  playerNames: ["Ana", "Beto", "Caio", "Duda"],
};

describe("Lookup miss limit on every :code route (e2e)", () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let existingCode = "";
  let existingVersion = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16").start();
    const databaseUrl = container.getConnectionUri();

    execSync("npx prisma migrate deploy", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "silent";
    process.env.THROTTLE_TTL_MS = "60000";
    process.env.THROTTLE_GLOBAL_LIMIT = "20";
    process.env.THROTTLE_CREATE_LIMIT = "10";
    process.env.THROTTLE_LOOKUP_MISS_LIMIT = "2";

    const { createApp } = await import("../src/main.js");
    app = await createApp();
    await app.init();

    const created = await request(httpServerOf(app)).post("/api/matches").send(createBody);
    existingCode = (created.body as { code: string }).code;
    existingVersion = (created.body as { version: number }).version;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it("CEN-14: the global limit applies to :code routes of an existing match", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await request(httpServerOf(app)).get(`/api/matches/${existingCode}`);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("F9 CEN-6/CEN-7/CEN-8: format and action-route misses block the IP, even for an existing code", async () => {
    const invalid = await request(httpServerOf(app)).get("/api/matches/abc/games");
    const unknownAction = await request(httpServerOf(app))
      .post("/api/matches/ZZZZZZZZ/start")
      .set("If-Match", "1");
    const blockedTimer = await request(httpServerOf(app))
      .post("/api/matches/ZZZZZZZZ/timer/start")
      .set("If-Match", "1");
    const blockedExisting = await request(httpServerOf(app))
      .post(`/api/matches/${existingCode}/reshuffle`)
      .set("If-Match", String(existingVersion));

    expect([invalid.status, invalid.body]).toEqual([404, { code: "MATCH_NOT_FOUND" }]);
    expect([unknownAction.status, unknownAction.body]).toEqual([404, { code: "MATCH_NOT_FOUND" }]);
    expect([blockedTimer.status, blockedTimer.body]).toEqual([429, { code: "TOO_MANY_LOOKUPS" }]);
    expect([blockedExisting.status, blockedExisting.body]).toEqual([429, { code: "TOO_MANY_LOOKUPS" }]);
  });

  it("F9 CEN-9: creating a match is not blocked by lookup misses", async () => {
    const response = await request(httpServerOf(app)).post("/api/matches").send(createBody);
    expect(response.status).toBe(201);
  });
});
