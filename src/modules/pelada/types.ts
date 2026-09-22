export type { Player } from "./players";
import type { Player } from "./players";

export type Team = {
  id: string;
  players: Player[];
  color: string | null;
  matchStreak: number;
};

export type PeladaState = {
  teamSize: number;
  colors: string[];
  teams: Team[];
  queue: Player[];
};

export type TeamIdFactory = (index: number) => string;

export type DrawOutcome =
  | { type: "swap"; state: PeladaState }
  | { type: "penalties" };
