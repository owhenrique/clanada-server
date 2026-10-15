import { ApiProperty } from "@nestjs/swagger";
import {
  computeSplit,
  projectDepartedPlayers,
  splitDueAtMs,
} from "../../../domain/match";
import type {
  MatchSplitPlayerState,
  StoredEvent,
  StoredMatch,
} from "../repositories/matches.repository";

export class SplitPlayerView {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  left!: boolean;

  @ApiProperty()
  pays!: boolean;

  @ApiProperty()
  paidCents!: number;

  @ApiProperty()
  received!: boolean;

  @ApiProperty()
  owedCents!: number;
}

export class SplitView {
  @ApiProperty()
  totalCents!: number;

  @ApiProperty()
  hourlyRateCents!: number;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty()
  paidTotalCents!: number;

  @ApiProperty()
  remainingCents!: number;

  @ApiProperty()
  payerCount!: number;

  @ApiProperty()
  perPersonCents!: number;

  @ApiProperty()
  receivedCount!: number;

  @ApiProperty()
  receivedCents!: number;

  @ApiProperty()
  pendingCents!: number;

  @ApiProperty({ nullable: true, type: String })
  startedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  dueAt!: string | null;

  @ApiProperty({ type: [SplitPlayerView] })
  players!: SplitPlayerView[];
}

export function findMatchStartedAt(
  events: readonly StoredEvent[],
): Date | null {
  for (const entry of events) {
    if (entry.event.type === "MATCH_STARTED") {
      return entry.createdAt;
    }
  }
  return null;
}

function presentPlayers(
  stored: StoredMatch,
): Array<{ id: string; name: string }> {
  return [
    ...stored.snapshot.teams.flatMap((team) => team.players),
    ...stored.snapshot.queue,
  ];
}

export function toSplitView(
  stored: StoredMatch,
  activeEvents: readonly StoredEvent[],
): SplitView {
  const config = stored.snapshot.config.split;
  const totalCents = Math.ceil(
    (config.hourlyRateCents * config.durationMinutes) / 60,
  );
  const startedAt = findMatchStartedAt(activeEvents);
  const dueAtMs =
    startedAt === null
      ? null
      : splitDueAtMs(startedAt.getTime(), config.durationMinutes);
  const overrides = stored.split?.players ?? {};

  const rows = [
    ...presentPlayers(stored).map((player) => ({
      id: player.id,
      name: player.name,
      left: false,
    })),
    ...projectDepartedPlayers(activeEvents).map((player) => ({
      id: player.id,
      name: player.name,
      left: true,
    })),
  ];
  const state = rows.map((row) => {
    const override = overrides[row.id];
    return {
      id: row.id,
      name: row.name,
      left: row.left,
      pays: override?.pays ?? true,
      paidCents: override?.paidCents ?? 0,
      received: override?.received ?? false,
    };
  });

  const totals = computeSplit({ totalCents, entries: state });
  const receivedCount = state.filter((entry) => entry.received).length;
  const receivedCents = Math.min(
    totalCents,
    totals.paidTotalCents + receivedCount * totals.perPersonCents,
  );
  const pendingCents = Math.max(
    0,
    totals.remainingCents - receivedCount * totals.perPersonCents,
  );

  return {
    totalCents,
    hourlyRateCents: config.hourlyRateCents,
    durationMinutes: config.durationMinutes,
    paidTotalCents: totals.paidTotalCents,
    remainingCents: totals.remainingCents,
    payerCount: totals.payerCount,
    perPersonCents: totals.perPersonCents,
    receivedCount,
    receivedCents,
    pendingCents,
    startedAt: startedAt === null ? null : startedAt.toISOString(),
    dueAt: dueAtMs === null ? null : new Date(dueAtMs).toISOString(),
    players: state.map((entry) => ({
      id: entry.id,
      name: entry.name,
      left: entry.left,
      pays: entry.pays,
      paidCents: entry.paidCents,
      received: entry.received,
      owedCents:
        entry.pays && entry.paidCents === 0 && !entry.received
          ? totals.perPersonCents
          : 0,
    })),
  };
}

export function splitRosterIds(
  stored: StoredMatch,
  activeEvents: readonly StoredEvent[],
): Set<string> {
  const ids = new Set(presentPlayers(stored).map((player) => player.id));
  for (const player of projectDepartedPlayers(activeEvents)) {
    ids.add(player.id);
  }
  return ids;
}

export function normalizeSplitEntry(
  input: MatchSplitPlayerState,
): MatchSplitPlayerState {
  return {
    pays: input.pays,
    paidCents: input.pays ? 0 : input.paidCents,
    received: input.pays ? input.received : false,
  };
}
