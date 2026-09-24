import { describe, expect, it } from "vitest";
import type { Event, MatchState } from "../../../domain/match";
import { EventLogGameHistoryRepository } from "./event-log-game-history.repository";
import { InMemoryMatchesRepository } from "./in-memory-matches.repository";

const config = { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 };
const players = [
  { id: "p0", name: "Ana" },
  { id: "p1", name: "Beto" },
  { id: "p2", name: "Caio" },
  { id: "p3", name: "Duda" },
];
const created: Event = { type: "MATCH_CREATED", config, players, teamIds: ["t0", "t1"] };
const snapshot: MatchState = { status: "DRAFT", config, teams: [], queue: [] };

describe("EventLogGameHistoryRepository", () => {
  it("CEN-5 (DT-2): lists the games projected from the active events, skipping revoked ones", async () => {
    const matches = new InMemoryMatchesRepository();
    const stored = await matches.create({ code: "AB23CD45", event: created, snapshot });
    const started = await matches.append({
      matchId: stored.id,
      expectedVersion: stored.version,
      events: [{ type: "MATCH_STARTED" }],
      snapshot: { ...snapshot, status: "ACTIVE" },
    });
    const won = await matches.append({
      matchId: stored.id,
      expectedVersion: started.version,
      events: [{ type: "GAME_WON", loserTeamId: "t1", decidedBy: "match", newTeamIds: [] }],
      snapshot,
    });
    const revoked = await matches.revokeLast({ matchId: stored.id, expectedVersion: won.version, snapshot });
    await matches.append({
      matchId: stored.id,
      expectedVersion: revoked.version,
      events: [{ type: "GAME_WON", loserTeamId: "t0", decidedBy: "penalties", newTeamIds: [] }],
      snapshot,
    });

    const games = await new EventLogGameHistoryRepository(matches).listByMatchId(stored.id);

    expect(games.map(({ number, outcome, winnerTeamId }) => ({ number, outcome, winnerTeamId }))).toEqual([
      { number: 1, outcome: "penalties", winnerTeamId: "t1" },
    ]);
  });
});
