import { execSync } from "node:child_process";
import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MatchView } from "../src/modules/matches/services/match-view";

type HttpServer = Parameters<typeof request>[0];

function httpServerOf(app: INestApplication): HttpServer {
  return app.getHttpServer() as HttpServer;
}

function viewOf(response: request.Response): MatchView {
  return response.body as MatchView;
}

const createBody = {
  config: { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 },
  playerNames: ["Ana", "Beto", "Caio", "Duda"],
};

describe("Matches API (e2e)", () => {
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
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";

    const { createApp } = await import("../src/main.js");
    app = await createApp();
    await app.init();
  }, 120000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it("CEN-1: POST /api/matches creates a DRAFT match", async () => {
    const response = await request(httpServerOf(app)).post("/api/matches").send(createBody);
    const view = viewOf(response);

    expect(response.status).toBe(201);
    expect(view).toMatchObject({ status: "DRAFT", version: 1, canUndo: false });
    expect(typeof view.code).toBe("string");
    expect(view.code).toHaveLength(8);
    expect(view.teams).toHaveLength(2);
  });

  it.each([
    ["teamSize below 2", { ...createBody, config: { ...createBody.config, teamSize: 1 } }],
    ["fewer than 2 colors", { ...createBody, config: { ...createBody.config, colors: ["verde"] } }],
    [
      "color outside the palette",
      { ...createBody, config: { ...createBody.config, colors: ["verde", "invisivel"] } },
    ],
    ["gameMinutes 0", { ...createBody, config: { ...createBody.config, gameMinutes: 0 } }],
    ["empty playerNames", { ...createBody, playerNames: [] }],
  ])("CEN-3: POST /api/matches rejects invalid DTO (%s)", async (_label, body) => {
    const response = await request(httpServerOf(app)).post("/api/matches").send(body);

    expect(response.status).toBe(400);
  });

  it("CEN-6: create -> reshuffle -> swap -> start -> GET reflects each step", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));
    const code = created.code;

    const reshuffledResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/reshuffle`)
      .set("If-Match", String(created.version))
      .send();
    const reshuffled = viewOf(reshuffledResponse);
    expect(reshuffledResponse.status).toBe(200);
    expect(reshuffled.version).toBe(2);

    const playerAId = reshuffled.teams[0]?.players[0]?.id;
    const playerBId = reshuffled.teams[1]?.players[0]?.id;
    if (playerAId === undefined || playerBId === undefined) {
      throw new Error("fixture is missing players");
    }
    const swappedResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/swap`)
      .set("If-Match", String(reshuffled.version))
      .send({ playerAId, playerBId });
    const swapped = viewOf(swappedResponse);
    expect(swappedResponse.status).toBe(200);
    expect(swapped.version).toBe(3);

    const startedResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/start`)
      .set("If-Match", String(swapped.version))
      .send();
    const started = viewOf(startedResponse);
    expect(startedResponse.status).toBe(200);
    expect(started.status).toBe("ACTIVE");
    expect(started.version).toBe(4);

    const fetchedResponse = await request(httpServerOf(app)).get(`/api/matches/${code}`);
    expect(fetchedResponse.status).toBe(200);
    expect(viewOf(fetchedResponse)).toMatchObject({ code, status: "ACTIVE", version: 4 });
  });

  it("CEN-7: GET /api/matches/:code with an unknown code returns 404", async () => {
    const response = await request(httpServerOf(app)).get("/api/matches/ZZZZZZZZ");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "MATCH_NOT_FOUND" });
  });

  it("CEN-15: mutation without If-Match returns 400", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));

    const response = await request(httpServerOf(app)).post(`/api/matches/${created.code}/reshuffle`).send();

    expect(response.status).toBe(400);
  });

  it("CEN-16: a stale If-Match returns 412 with the current MatchView, without a code wrapper", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));

    const response = await request(httpServerOf(app))
      .post(`/api/matches/${created.code}/reshuffle`)
      .set("If-Match", "99")
      .send();

    expect(response.status).toBe(412);
    expect(viewOf(response)).toMatchObject({ code: created.code, version: 1, status: "DRAFT" });

    const fetched = viewOf(await request(httpServerOf(app)).get(`/api/matches/${created.code}`));
    expect(fetched.version).toBe(1);
  });
});
