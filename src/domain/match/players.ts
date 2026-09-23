export type Player = {
  id: string;
  name: string;
};

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function groupKey(player: Player): string {
  return normalizeName(player.name).toLowerCase();
}

export function duplicateGroups(players: Player[]): Player[][] {
  const groups = new Map<string, Player[]>();
  for (const player of players) {
    const key = groupKey(player);
    const group = groups.get(key) ?? [];
    group.push(player);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function hasUnresolvedDuplicates(players: Player[]): boolean {
  return duplicateGroups(players).length > 0;
}
