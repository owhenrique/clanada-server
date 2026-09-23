import { Module } from "@nestjs/common";
import { MatchesController } from "./controllers/matches.controller";
import { MatchesRepository } from "./repositories/matches.repository";
import { PrismaMatchesRepository } from "./repositories/prisma-matches.repository";
import { LookupMissLimiter } from "./services/lookup-miss-limiter";
import { MatchesService } from "./services/matches.service";

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, LookupMissLimiter, { provide: MatchesRepository, useClass: PrismaMatchesRepository }],
  exports: [MatchesRepository],
})
export class MatchesModule {}
