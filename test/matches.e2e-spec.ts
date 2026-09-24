import { execSync } from "node:child_process";
import type { INestApplication } from "@nestjs/common";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import type { GameView } from "../src/modules/matches/services/game-view";
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
    process.env.THROTTLE_GLOBAL_LIMIT = "10000";
    process.env.THROTTLE_CREATE_LIMIT = "10000";
    process.env.THROTTLE_LOOKUP_MISS_LIMIT = "10000";

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

  it("CEN-11: timer routes start, pause and reset the match timer", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));
    const code = created.code;
    const started = viewOf(
      await request(httpServerOf(app))
        .post(`/api/matches/${code}/start`)
        .set("If-Match", String(created.version))
        .send(),
    );

    const startResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/timer/start`)
      .set("If-Match", String(started.version))
      .send();
    const running = viewOf(startResponse);
    expect(startResponse.status).toBe(200);
    expect(running.version).toBe(started.version + 1);
    expect(running.timer.startedAt).not.toBeNull();
    expect(typeof running.serverNow).toBe("string");

    const pauseResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/timer/pause`)
      .set("If-Match", String(running.version))
      .send();
    const paused = viewOf(pauseResponse);
    expect(pauseResponse.status).toBe(200);
    expect(paused.timer.startedAt).toBeNull();
    expect(paused.timer.elapsedMs).toBeGreaterThanOrEqual(0);

    const resetResponse = await request(httpServerOf(app))
      .post(`/api/matches/${code}/timer/reset`)
      .set("If-Match", String(paused.version))
      .send();
    expect(resetResponse.status).toBe(200);
    expect(viewOf(resetResponse).timer).toEqual({ startedAt: null, elapsedMs: 0 });

    const withoutIfMatch = await request(httpServerOf(app)).post(`/api/matches/${code}/timer/start`).send();
    expect(withoutIfMatch.status).toBe(400);
  });

  it("CEN-11: timer route on a DRAFT match returns 422 INVALID_STATUS", async () => {
    const created = viewOf(await request(httpServerOf(app)).post("/api/matches").send(createBody));

    const response = await request(httpServerOf(app))
      .post(`/api/matches/${created.code}/timer/start`)
      .set("If-Match", String(created.version))
      .send();

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ code: "INVALID_STATUS" });
  });

  it("F3 CEN-7: GET /api/matches/:code/games returns only the active games, in seq order", async () => {
    const server = httpServerOf(app);
    const created = viewOf(await request(server).post("/api/matches").send(createBody));
    const code = created.code;
    const started = viewOf(
      await request(server).post(`/api/matches/${code}/start`).set("If-Match", String(created.version)).send(),
    );
    const winnerId = started.teams[0]?.id;
    const loserId = started.teams[1]?.id;
    const won = viewOf(
      await request(server)
        .post(`/api/matches/${code}/games/win`)
        .set("If-Match", String(started.version))
        .send({ loserTeamId: loserId }),
    );
    const undone = viewOf(
      await request(server).post(`/api/matches/${code}/undo`).set("If-Match", String(won.version)).send(),
    );
    const decided = viewOf(
      await request(server)
        .post(`/api/matches/${code}/games/penalties`)
        .set("If-Match", String(undone.version))
        .send({ loserTeamId: loserId }),
    );
    await request(server).post(`/api/matches/${code}/end`).set("If-Match", String(decided.version)).send();

    const response = await request(server).get(`/api/matches/${code}/games`);
    const games = response.body as GameView[];

    expect(response.status).toBe(200);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ number: 1, outcome: "penalties", winnerTeamId: winnerId });
    expect(games[0]?.teams.map((team) => team.teamId)).toEqual([winnerId, loserId]);
    expect(games[0]?.teams[0]?.players).toEqual(started.teams[0]?.players);
    expect(new Date(games[0]?.playedAt ?? "").toISOString()).toBe(games[0]?.playedAt);
  });

  it("F3 CEN-8: GET /api/matches/:code/games with an unknown code returns 404", async () => {
    const response = await request(httpServerOf(app)).get("/api/matches/ZZZZZZZZ/games");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "MATCH_NOT_FOUND" });
  });

  it.each([
    ["omitted", undefined, true],
    ["empty", {}, true],
    ["off", { arrivalPriority: false }, false],
  ])("F4 CEN-10: POST /api/matches resolves rule toggles (%s)", async (_label, ruleToggles, expected) => {
    const server = httpServerOf(app);
    const created = viewOf(
      await request(server)
        .post("/api/matches")
        .send({ ...createBody, config: { ...createBody.config, ruleToggles } }),
    );

    const response = await request(server).get(`/api/matches/${created.code}`);

    expect(viewOf(response).config.ruleToggles).toEqual({ arrivalPriority: expected });
  });

  it.each([
    ["non-boolean value", { arrivalPriority: "sim" }],
    ["unknown key", { arrivalPriority: true, bogus: true }],
  ])("F4 CEN-10: POST /api/matches rejects invalid rule toggles (%s)", async (_label, ruleToggles) => {
    const response = await request(httpServerOf(app))
      .post("/api/matches")
      .send({ ...createBody, config: { ...createBody.config, ruleToggles } });

    expect(response.status).toBe(400);
  });

  it("F4 CEN-12: a match persisted before rule toggles is read with every rule off", async () => {
    const server = httpServerOf(app);
    const names = Array.from({ length: 11 }, (_, index) => `p${index + 1}`);
    const created = viewOf(
      await request(server)
        .post("/api/matches")
        .send({ config: { ...createBody.config, teamSize: 5 }, playerNames: names }),
    );
    const prisma = app.get(PrismaService);
    const row = await prisma.match.findUniqueOrThrow({ where: { code: created.code } });
    const snapshot = row.snapshot as Prisma.JsonObject;
    const { ruleToggles: _dropped, ...legacyConfig } = snapshot.config as Prisma.JsonObject;
    await prisma.match.update({
      where: { id: row.id },
      data: { snapshot: { ...snapshot, config: legacyConfig } },
    });

    const fetched = await request(server).get(`/api/matches/${created.code}`);
    expect(viewOf(fetched).config.ruleToggles).toEqual({ arrivalPriority: false });

    let current = created;
    const queues: string[][] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const reshuffled = await request(server)
        .post(`/api/matches/${created.code}/reshuffle`)
        .set("If-Match", String(current.version))
        .send();
      expect(reshuffled.status).toBe(200);
      current = viewOf(reshuffled);
      queues.push(current.queue.map((player) => player.name));
    }

    expect(queues.some((queue) => queue.join() !== "p11")).toBe(true);
  });

  it("CEN-16: Swagger UI is served outside production", async () => {
    const response = await request(httpServerOf(app)).get("/api/docs/");

    expect(response.status).toBe(200);
  });
});
