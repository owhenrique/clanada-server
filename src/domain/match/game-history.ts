import type { Event } from "./events";
import type { MatchState, Player, Team } from "./types";
import { applyEvent } from "./apply-event";

export type HistoryEvent = {
  seq: number;
  createdAt: Date;
  event: Event;
};

export type GameOutcome = "win" | "penalties" | "draw";

export type GameTeamRecord = {
  teamId: string;
  color: string | null;
  players: Player[];
};

export type GameRecord = {
  number: number;
  seq: number;
  playedAt: Date;
  outcome: GameOutcome;
  winnerTeamId: string | null;
  teams: GameTeamRecord[];
};

const ON_FIELD_TEAM_COUNT = 2;

function toTeamRecord(team: Team): GameTeamRecord {
  return {
    teamId: team.id,
    color: team.color,
    players: team.players.map((player) => ({ id: player.id, name: player.name })),
  };
}

function toGameRecord(state: MatchState, entry: HistoryEvent, number: number): GameRecord | null {
  const { event } = entry;
  if (event.type !== "GAME_WON" && event.type !== "GAME_DRAWN") {
    return null;
  }
  const onField = state.teams.slice(0, ON_FIELD_TEAM_COUNT);
  const base = { number, seq: entry.seq, playedAt: entry.createdAt, teams: onField.map(toTeamRecord) };
  if (event.type === "GAME_DRAWN") {
    return { ...base, outcome: "draw", winnerTeamId: null };
  }
  const winner = onField.find((team) => team.id !== event.loserTeamId);
  return {
    ...base,
    outcome: event.decidedBy === "penalties" ? "penalties" : "win",
    winnerTeamId: winner?.id ?? null,
  };
}

export function projectGameHistory(events: readonly HistoryEvent[]): GameRecord[] {
  const records: GameRecord[] = [];
  let state: MatchState | null = null;
  for (const entry of events) {
    if (state !== null) {
      const record = toGameRecord(state, entry, records.length + 1);
      if (record !== null) {
        records.push(record);
      }
    }
    state = applyEvent(state, entry.event);
  }
  return records;
}
