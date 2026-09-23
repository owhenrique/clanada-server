import { Module } from "@nestjs/common";
import { MatchesController } from "./controllers/matches.controller";
import { MatchesRepository } from "./repositories/matches.repository";
import { PrismaMatchesRepository } from "./repositories/prisma-matches.repository";
import { MatchesService } from "./services/matches.service";

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, { provide: MatchesRepository, useClass: PrismaMatchesRepository }],
  exports: [MatchesRepository],
})
export class MatchesModule {}
