import { Module } from "@nestjs/common";
import { MatchesRepository } from "./matches.repository";
import { PrismaMatchesRepository } from "./prisma-matches.repository";

@Module({
  providers: [{ provide: MatchesRepository, useClass: PrismaMatchesRepository }],
  exports: [MatchesRepository],
})
export class MatchesModule {}
