import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type HttpServer = Parameters<typeof request>[0];

function httpServerOf(app: INestApplication): HttpServer {
  return app.getHttpServer() as HttpServer;
}

describe("GET /api/health (e2e)", () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16").start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";

    const { createApp } = await import("../src/main.js");
    app = await createApp();
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it("responds 200 when the database is reachable", async () => {
    const response = await request(httpServerOf(app)).get("/api/health");

    expect(response.status).toBe(200);
  });

  it("echoes back the x-request-id header sent by the client", async () => {
    const response = await request(httpServerOf(app))
      .get("/api/health")
      .set("x-request-id", "test-request-id-123");

    expect(response.headers["x-request-id"]).toBe("test-request-id-123");
  });

  it("generates an x-request-id header when the client sends none", async () => {
    const response = await request(httpServerOf(app)).get("/api/health");

    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});
