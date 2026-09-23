import { ApiProperty } from "@nestjs/swagger";
import { UNDOABLE_EVENTS, type MatchStatus } from "../../../domain/match";
import type { StoredEvent, StoredMatch } from "../repositories/matches.repository";
import { MatchConfigDto } from "../dto/match-config.dto";

export class PlayerView {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class TeamView {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [PlayerView] })
  players!: PlayerView[];

  @ApiProperty({ nullable: true, type: String })
  color!: string | null;

  @ApiProperty()
  gameStreak!: number;
}

export class TimerView {
  @ApiProperty({ nullable: true, type: String })
  startedAt!: string | null;

  @ApiProperty()
  elapsedMs!: number;
}

export class MatchView {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ["DRAFT", "ACTIVE", "ENDED"] })
  status!: MatchStatus;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: MatchConfigDto })
  config!: MatchConfigDto;

  @ApiProperty({ type: [TeamView] })
  teams!: TeamView[];

  @ApiProperty({ type: [PlayerView] })
  queue!: PlayerView[];

  @ApiProperty({ type: TimerView })
  timer!: TimerView;

  @ApiProperty()
  serverNow!: string;

  @ApiProperty()
  canUndo!: boolean;
}

export function toMatchView(stored: StoredMatch, activeEvents: readonly StoredEvent[], now: Date): MatchView {
  return {
    code: stored.code,
    status: stored.status,
    version: stored.version,
    config: stored.snapshot.config,
    teams: stored.snapshot.teams,
    queue: stored.snapshot.queue,
    timer: {
      startedAt: stored.timer.startedAt === null ? null : stored.timer.startedAt.toISOString(),
      elapsedMs: stored.timer.elapsedMs,
    },
    serverNow: now.toISOString(),
    canUndo: activeEvents.some((active) => UNDOABLE_EVENTS.has(active.event.type)),
  };
}
