import { Module } from "@nestjs/common";
import { MatchesController } from "./controllers/matches.controller";
import { EventLogGameHistoryRepository } from "./repositories/event-log-game-history.repository";
import { GameHistoryRepository } from "./repositories/game-history.repository";
import { MatchesRepository } from "./repositories/matches.repository";
import { PrismaMatchesRepository } from "./repositories/prisma-matches.repository";
import { LookupMissLimiter } from "./services/lookup-miss-limiter";
import { MatchesService } from "./services/matches.service";

@Module({
  controllers: [MatchesController],
  providers: [
    MatchesService,
    LookupMissLimiter,
    { provide: MatchesRepository, useClass: PrismaMatchesRepository },
    { provide: GameHistoryRepository, useClass: EventLogGameHistoryRepository },
  ],
  exports: [MatchesRepository],
})
export class MatchesModule {}
