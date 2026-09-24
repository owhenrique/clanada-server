import type { Player } from "./model";

export function makePlayers(count: number, prefix = "p"): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
    name: `${prefix.toUpperCase()}${index}`,
  }));
}

export function mkPlayer(id: string): Player {
  return { id, name: id };
}

export function idGen(): () => string {
  let n = 0;
  return () => `n${n++}`;
}

export const teamId = (index: number): string => `t${index}`;
