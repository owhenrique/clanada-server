import { ApiProperty } from "@nestjs/swagger";
import type { GameOutcome, GameRecord } from "../../../domain/match";
import { PlayerView } from "./match-view";

export class GameTeamView {
  @ApiProperty()
  teamId!: string;

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty({ type: [PlayerView] })
  players!: PlayerView[];
}

export class GameView {
  @ApiProperty()
  number!: number;

  @ApiProperty()
  seq!: number;

  @ApiProperty()
  playedAt!: string;

  @ApiProperty({ enum: ["win", "penalties", "draw"] })
  outcome!: GameOutcome;

  @ApiProperty({ nullable: true, type: String })
  winnerTeamId!: string | null;

  @ApiProperty({ type: [GameTeamView], minItems: 2, maxItems: 2 })
  teams!: GameTeamView[];
}

export function toGameView(record: GameRecord): GameView {
  return { ...record, playedAt: record.playedAt.toISOString() };
}
