import { describe, it, expect } from "vitest";
import { projectGameHistory, type GameRecord, type HistoryEvent } from "./game-history";
import type { Event, MatchConfig, Player } from "./model";
import { DEFAULT_SPLIT_CONFIG } from "./model";

const config: MatchConfig = {
  teamSize: 2,
  colors: ["azul", "vermelho", "verde", "amarelo"],
  gameMinutes: 7,
  ruleToggles: { arrivalPriority: false, drawKeepsVeteran: false },
  split: DEFAULT_SPLIT_CONFIG,
};

const names = ["Ana", "Bia", "Caio", "Duda", "Edu", "Fê", "Gil", "Hugo"];

function makePlayers(count: number): Player[] {
  return names.slice(0, count).map((name, index) => ({ id: `p${index}`, name }));
}

const BASE = Date.parse("2026-09-23T23:00:00.000Z");

function history(events: Event[], seqs?: number[], lastCreatedAt?: Date): HistoryEvent[] {
  return events.map((event, index) => ({
    seq: seqs?.[index] ?? index + 1,
    createdAt:
      index === events.length - 1 && lastCreatedAt
        ? lastCreatedAt
        : new Date(BASE + index * 60_000),
    event,
  }));
}

function single(records: GameRecord[]): GameRecord {
  const [record, ...rest] = records;
  if (record === undefined || rest.length > 0) {
    throw new Error(`expected exactly one game, got ${records.length}`);
  }
  return record;
}

function created(playerCount: number, teamIds: string[]): Event[] {
  return [
    {
      type: "MATCH_CREATED",
      config,
      players: makePlayers(playerCount),
      teamIds,
    },
    { type: "MATCH_STARTED" },
  ];
}

describe("projectGameHistory", () => {
  it("CEN-1: records a win with both on-field teams as they were before the game ended", () => {
    const events = history(
      [
        ...created(6, ["q1", "q2", "q3"]),
        {
          type: "GAME_WON",
          loserTeamId: "q2",
          decidedBy: "match",
          newTeamIds: [],
        },
      ],
      undefined,
      new Date("2026-09-23T23:25:00.000Z"),
    );

    expect(projectGameHistory(events)).toEqual([
      {
        number: 1,
        seq: 3,
        playedAt: new Date("2026-09-23T23:25:00.000Z"),
        outcome: "win",
        winnerTeamId: "q1",
        teams: [
          {
            teamId: "q1",
            color: "azul",
            name: "Atacadão",
            players: [
              { id: "p0", name: "Ana" },
              { id: "p1", name: "Bia" },
            ],
          },
          {
            teamId: "q2",
            color: "vermelho",
            name: "Tatico",
            players: [
              { id: "p2", name: "Caio" },
              { id: "p3", name: "Duda" },
            ],
          },
        ],
      },
    ]);
  });

  it("CEN-1b: records a null team name when the event has no free name", () => {
    const events = history([
      {
        type: "MATCH_CREATED",
        config,
        players: makePlayers(6),
        teamIds: ["q1", "q2", "q3"],
        teamNames: [null, null, null],
      },
      { type: "MATCH_STARTED" },
      {
        type: "GAME_WON",
        loserTeamId: "q2",
        decidedBy: "match",
        newTeamIds: [],
      },
    ]);

    expect(projectGameHistory(events)[0]?.teams.map((team) => team.name)).toEqual([null, null]);
  });

  it("CEN-2: records a penalties win with the other on-field team as winner", () => {
    const record = single(
      projectGameHistory(
        history([
          ...created(6, ["q1", "q2", "q3"]),
          {
            type: "GAME_WON",
            loserTeamId: "q1",
            decidedBy: "penalties",
            newTeamIds: [],
          },
        ]),
      ),
    );

    expect(record.outcome).toBe("penalties");
    expect(record.winnerTeamId).toBe("q2");
  });

  it("CEN-3: records a draw with swap, without a winner", () => {
    const record = single(
      projectGameHistory(
        history([
          ...created(8, ["q1", "q2", "q3", "q4"]),
          {
            type: "GAME_DRAWN",
            firstLeaverTeamId: "q1",
            newTeamIds: ["q5", "q6"],
          },
        ]),
      ),
    );

    expect(record.outcome).toBe("draw");
    expect(record.winnerTeamId).toBeNull();
    expect(record.teams).toEqual([
      {
        teamId: "q1",
        color: "azul",
        name: "Atacadão",
        players: [
          { id: "p0", name: "Ana" },
          { id: "p1", name: "Bia" },
        ],
      },
      {
        teamId: "q2",
        color: "vermelho",
        name: "Tatico",
        players: [
          { id: "p2", name: "Caio" },
          { id: "p3", name: "Duda" },
        ],
      },
    ]);
  });

  it("CEN-4: keeps the players of a past game frozen after later changes", () => {
    const records = projectGameHistory(
      history([
        ...created(7, ["q1", "q2", "q3"]),
        {
          type: "GAME_WON",
          loserTeamId: "q2",
          decidedBy: "match",
          newTeamIds: ["q4"],
        },
        {
          type: "PLAYER_LEFT",
          playerId: "p0",
          fallback: "none",
          newTeamIds: [],
        },
        {
          type: "GAME_WON",
          loserTeamId: "q3",
          decidedBy: "match",
          newTeamIds: ["q5"],
        },
      ]),
    );

    expect(records).toHaveLength(2);
    expect(records[0]?.teams[0]).toEqual({
      teamId: "q1",
      color: "azul",
      name: "Atacadão",
      players: [
        { id: "p0", name: "Ana" },
        { id: "p1", name: "Bia" },
      ],
    });
    expect(records[1]?.teams[0]).toEqual({
      teamId: "q1",
      color: "azul",
      name: "Atacadão",
      players: [
        { id: "p1", name: "Bia" },
        { id: "p3", name: "Duda" },
      ],
    });
  });

  it("CEN-5: numbers only the active games, without gaps", () => {
    const events = history(
      [
        ...created(6, ["q1", "q2", "q3"]),
        {
          type: "GAME_WON",
          loserTeamId: "q2",
          decidedBy: "match",
          newTeamIds: [],
        },
        {
          type: "GAME_WON",
          loserTeamId: "q1",
          decidedBy: "match",
          newTeamIds: [],
        },
      ],
      [1, 2, 3, 6],
    );

    expect(projectGameHistory(events).map(({ number, seq }) => ({ number, seq }))).toEqual([
      { number: 1, seq: 3 },
      { number: 2, seq: 6 },
    ]);
  });

  it("CEN-6: returns an empty history when no game was played", () => {
    expect(
      projectGameHistory(history([...created(6, ["q1", "q2", "q3"]), { type: "MATCH_ENDED" }])),
    ).toEqual([]);
  });
});

describe("E5: draw decided by the drawKeepsVeteran rule", () => {
  it("is recorded as a draw without winner", () => {
    const events: Event[] = [
      { type: "MATCH_CREATED", config, players: makePlayers(4), teamIds: ["t0", "t1"] },
      { type: "MATCH_STARTED" },
      { type: "GAME_WON", loserTeamId: "t1", decidedBy: "draw", newTeamIds: [] },
    ];
    const record = single(projectGameHistory(history(events)));
    expect(record.outcome).toBe("draw");
    expect(record.winnerTeamId).toBeNull();
  });
});
