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

describe("Throttling and security headers (e2e)", () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

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
    process.env.THROTTLE_CREATE_LIMIT = "2";
    process.env.THROTTLE_LOOKUP_MISS_LIMIT = "2";

    const { createApp } = await import("../src/main.js");
    app = await createApp();
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it("CEN-14: the third POST /api/matches within the window returns 429", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(httpServerOf(app)).post("/api/matches").send(createBody);
      statuses.push(response.status);
    }

    expect(statuses).toEqual([201, 201, 429]);
  });

  it("CEN-14: the third lookup of an unknown code returns 429 TOO_MANY_LOOKUPS", async () => {
    const first = await request(httpServerOf(app)).get("/api/matches/NAOEXISTE");
    const second = await request(httpServerOf(app)).get("/api/matches/NAOEXISTE");
    const third = await request(httpServerOf(app)).get("/api/matches/NAOEXISTE");

    expect([first.status, second.status]).toEqual([404, 404]);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ code: "TOO_MANY_LOOKUPS" });
  });

  it("CEN-14: /api/health is never throttled", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await request(httpServerOf(app)).get("/api/health");
      statuses.push(response.status);
    }

    expect(statuses).toEqual(Array.from({ length: 21 }, () => 200));
  });

  it("CEN-14: responses carry helmet headers and no CORS header", async () => {
    const response = await request(httpServerOf(app)).get("/api/health").set("Origin", "https://evil.example");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("CEN-16: Swagger UI is not mounted in production", async () => {
    const response = await request(httpServerOf(app)).get("/api/docs/");

    expect(response.status).toBe(404);
  });
});
