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

  it("S7 CEN-24: a mutation on a new route without If-Match returns 400", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));

    const response = await request(httpServerOf(app))
      .post(`/api/matches/${created.code}/games/win`)
      .send({ loserTeamId: "does-not-matter" });

    expect(response.status).toBe(400);
  });

  it("S7 CEN-25: a stale If-Match on a new route returns 412 with the current MatchView", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));

    const response = await request(httpServerOf(app))
      .post(`/api/matches/${created.code}/players`)
      .set("If-Match", "99")
      .send({ name: "Gil" });

    expect(response.status).toBe(412);
    expect(viewOf(response)).toMatchObject({ code: created.code, version: 1, status: "DRAFT" });

    const fetched = viewOf(await request(httpServerOf(app)).get(`/api/matches/${created.code}`));
    expect(fetched.version).toBe(1);
  });

  it("S7 CEN-26: a full match flow exercises every new route with the version incrementing per step", async () => {
    const fivePlayerBody = {
      config: { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 },
      playerNames: ["Ana", "Beto", "Caio", "Duda", "Eva"],
    };

    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(fivePlayerBody));
    const code = created.code;
    expect(created.version).toBe(1);

    const started = viewOf(
      await request(httpServerOf(app)).post(`/api/matches/${code}/start`).set("If-Match", "1").send(),
    );
    expect(started.status).toBe("ACTIVE");
    expect(started.version).toBe(2);

    const winLoserId = started.teams[1]?.id;
    if (winLoserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const won = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/games/win`)
        .set("If-Match", "2")
        .send({ loserTeamId: winLoserId }),
    );
    expect(won.version).toBe(3);

    const drawResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/games/draw`)
      .set("If-Match", "3")
      .send();
    expect(drawResponse.status).toBe(200);
    expect(drawResponse.body).toEqual({ penaltiesRequired: true });

    const penaltiesLoserId = won.teams[0]?.id;
    if (penaltiesLoserId === undefined) {
      throw new Error("fixture is missing teams");
    }
    const penalized = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/games/penalties`)
        .set("If-Match", "3")
        .send({ loserTeamId: penaltiesLoserId }),
    );
    expect(penalized.version).toBe(4);

    const donorLeaverId = penalized.teams[0]?.players[0]?.id;
    if (donorLeaverId === undefined) {
      throw new Error("fixture is missing players");
    }
    const leftWithDonor = viewOf(
      await request(httpServerOf(app))
        .delete(`/api/matches/${code}/players/${donorLeaverId}`)
        .set("If-Match", "4")
        .send(),
    );
    expect(leftWithDonor.version).toBe(5);
    expect(leftWithDonor.queue).toEqual([]);

    const noDonorLeaverId = leftWithDonor.teams[1]?.players[0]?.id;
    if (noDonorLeaverId === undefined) {
      throw new Error("fixture is missing players");
    }
    const leftWithReduce = viewOf(
      await request(httpServerOf(app))
        .delete(`/api/matches/${code}/players/${noDonorLeaverId}?fallback=reduce-team-size`)
        .set("If-Match", "5")
        .send(),
    );
    expect(leftWithReduce.version).toBe(6);
    expect(leftWithReduce.config.teamSize).toBe(1);

    const joined = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/players`)
        .set("If-Match", "6")
        .send({ name: "Fabio" }),
    );
    expect(joined.version).toBe(7);
    expect(joined.queue).toEqual([]);

    const resized = viewOf(
      await request(httpServerOf(app))
        .put(`/api/matches/${code}/team-size`)
        .set("If-Match", "7")
        .send({ teamSize: 2 }),
    );
    expect(resized.version).toBe(8);
    expect(resized.config.teamSize).toBe(2);
    expect(resized.teams).toHaveLength(2);

    const undo1 = viewOf(
      await request(httpServerOf(app)).post(`/api/matches/${code}/undo`).set("If-Match", "8").send(),
    );
    expect(undo1.version).toBe(9);
    const undo2 = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/undo`)
        .set("If-Match", String(undo1.version))
        .send(),
    );
    expect(undo2.version).toBe(10);
    const undo3 = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/undo`)
        .set("If-Match", String(undo2.version))
        .send(),
    );
    expect(undo3.version).toBe(11);
    expect(undo3.status).toBe("ACTIVE");

    const ended = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/end`)
        .set("If-Match", String(undo3.version))
        .send(),
    );
    expect(ended.status).toBe("ENDED");
    expect(ended.version).toBe(12);

    const rejectedLoserId = ended.teams[0]?.id ?? "unknown";
    const afterEndResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/games/win`)
      .set("If-Match", String(ended.version))
      .send({ loserTeamId: rejectedLoserId });
    expect(afterEndResponse.status).toBe(422);
    expect(afterEndResponse.body).toEqual({ code: "INVALID_STATUS" });

    const finalFetch = viewOf(await request(httpServerOf(app)).get(`/api/matches/${code}`));
    expect(finalFetch.version).toBe(12);
  });
});
