import type { HistoryEvent } from "./game-history";
import type { Event } from "./model";

export type SplitEntry = {
  pays: boolean;
  paidCents: number;
};

export type SplitTotals = {
  paidTotalCents: number;
  remainingCents: number;
  payerCount: number;
  perPersonCents: number;
};

export type DepartedPlayer = {
  id: string;
  name: string;
};

export function computeSplit({
  totalCents,
  entries,
}: {
  totalCents: number;
  entries: readonly SplitEntry[];
}): SplitTotals {
  const paidTotalCents = entries.reduce((total, entry) => total + entry.paidCents, 0);
  const remainingCents = Math.max(0, totalCents - paidTotalCents);
  const payerCount = entries.filter((entry) => entry.pays && entry.paidCents === 0).length;
  const perPersonCents = payerCount === 0 ? 0 : Math.ceil(remainingCents / payerCount);
  return { paidTotalCents, remainingCents, payerCount, perPersonCents };
}

export function splitDueAtMs(startedAtMs: number, durationMinutes: number): number {
  return startedAtMs + (durationMinutes / 2) * 60_000;
}

function recordNames(event: Event, names: Map<string, string>): void {
  if (event.type === "MATCH_CREATED" || event.type === "MATCH_SET_UP") {
    for (const player of event.players) {
      names.set(player.id, player.name);
    }
  }
  if (event.type === "PLAYER_JOINED") {
    names.set(event.player.id, event.player.name);
  }
}

export function projectDepartedPlayers(events: readonly HistoryEvent[]): DepartedPlayer[] {
  const names = new Map<string, string>();
  const departed: DepartedPlayer[] = [];
  for (const entry of events) {
    recordNames(entry.event, names);
    if (entry.event.type !== "PLAYER_LEFT") {
      continue;
    }
    const name = names.get(entry.event.playerId);
    if (name !== undefined) {
      departed.push({ id: entry.event.playerId, name });
    }
  }
  return departed;
}
